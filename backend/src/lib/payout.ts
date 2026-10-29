import { prisma } from "./prisma.js";
import { HttpError } from "./http.js";
import { feeAfterRefund, monthStart, monthsInPeriod, summariseRevenue, type RevenueLine } from "../domain/commission.js";
import { logger } from "./logger.js";

/**
 * Payouts — what the platform owes an organiser, and the record of sending it.
 *
 * Eventick collects the whole ticket price through CMI, so every dirham a
 * buyer pays arrives in the PLATFORM's merchant account, not the organiser's.
 * The organiser's share therefore has to be transferred to them separately,
 * and this is the ledger for that. Before this existed, the dashboard showed a
 * "Reversement" step that computed nothing and recorded nothing.
 *
 * Two rules hold the integrity together:
 *
 *  - An order belongs to at most ONE payout, enforced by a unique index on
 *    PayoutOrder.orderId rather than by a query. Two runs over overlapping
 *    periods therefore cannot pay for the same tickets twice, even if they
 *    race.
 *  - A payout's totals are FROZEN when it is created. They are copied from
 *    the orders, not recomputed on read, so a refund processed next week
 *    cannot change the value of a transfer already made.
 *  - A plan's fixed monthly fee is charged at most ONCE per calendar month,
 *    enforced by a unique index on (organiserId, month) rather than by a
 *    query, so overlapping runs cannot bill the same month twice.
 */

/**
 * The default plan, for organisers nobody has assigned one to.
 *
 * Returns the whole row, not just PlanTerms: callers that describe the plan to
 * the UI need its label too, and narrowing here would lose it.
 */
async function defaultPlan() {
  return (await prisma.plan.findFirst({ where: { isDefault: true } })) ?? undefined;
}

/**
 * The plan to price an UNRECORDED fee at.
 *
 * Orders settled before commission existed carry feeCents: null, and pricing
 * them at nothing would overstate what an organiser is owed. The first
 * version priced them at the platform default, which was worse than it
 * sounds: a Pro organiser (3%) had those orders charged at Starter's 5%, so
 * their reported commission went UP at a rate they were never on. Their own
 * plan is the only defensible guess; the default is for organisers who have
 * none.
 */
async function pricingPlanFor(organiserId: string) {
  const organiser = await prisma.user.findUnique({
    where: { id: organiserId },
    select: { plan: true },
  });
  return organiser?.plan ?? (await defaultPlan());
}

/**
 * What an organiser has earned, and what is still unpaid.
 *
 * `payableCents` counts only orders not yet in a payout — it is what the next
 * run would transfer. The lifetime figures are shown beside it so the number
 * can be explained without digging through orders.
 */
export async function organiserEarnings(organiserId: string) {
  const orders = await prisma.order.findMany({
    where: {
      event: { organiserId },
      status: { in: ["PAID", "REFUNDED"] },
    },
    select: {
      id: true,
      totalCents: true,
      refundedCents: true,
      feeCents: true,
      createdAt: true,
      payoutOrder: { select: { payoutId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const fallback = await pricingPlanFor(organiserId);
  const toLine = (o: (typeof orders)[number]): RevenueLine => ({
    totalCents: o.totalCents,
    refundedCents: o.refundedCents,
    feeCents: o.feeCents,
  });

  const lifetime = summariseRevenue(orders.map(toLine), fallback);
  const unpaid = orders.filter((o) => !o.payoutOrder);
  const pending = summariseRevenue(unpaid.map(toLine), fallback);

  const [paidOut, organiser] = await Promise.all([
    prisma.payout.aggregate({
      where: { organiserId, status: "PAID" },
      _sum: { netCents: true },
    }),
    prisma.user.findUnique({
      where: { id: organiserId },
      select: { plan: true, bankAccount: { select: { holderName: true, rib: true, bank: true } } },
    }),
  ]);

  const plan = organiser?.plan ?? (await defaultPlan()) ?? null;

  // Months already billed, so the UI can say what the subscription has cost
  // rather than leaving the deduction on a payout unexplained.
  const billed = await prisma.subscriptionCharge.aggregate({
    where: { organiserId },
    _sum: { amountCents: true },
    _count: { _all: true },
  });

  return {
    plan: plan
      ? {
          key: plan.key,
          label: plan.label,
          rateBps: plan.rateBps,
          monthlyCents: plan.monthlyCents,
          // True when the organiser has no plan of their own and is being
          // charged the default; the UI says so rather than implying a choice.
          assigned: Boolean(organiser?.plan),
        }
      : null,
    lifetime,
    /** Earned but not yet included in any payout. */
    pending,
    paidOutCents: paidOut._sum.netCents ?? 0,
    unpaidOrders: unpaid.length,
    subscription: {
      /** The plan's fixed monthly part, 0 on Starter. */
      monthlyCents: plan?.monthlyCents ?? 0,
      /** Charged to date, across every payout. */
      billedCents: billed._sum.amountCents ?? 0,
      billedMonths: billed._count._all,
    },
    bankAccount: organiser?.bankAccount
      ? {
          holderName: organiser.bankAccount.holderName,
          // Last four only: the full RIB is a payment credential, and the
          // screen that shows earnings does not need it.
          ribLast4: organiser.bankAccount.rib.slice(-4),
          bank: organiser.bankAccount.bank,
        }
      : null,
  };
}

/**
 * Create a payout for everything an organiser has earned and not been paid.
 *
 * Deliberately NOT period-driven from the caller's dates alone: the orders it
 * picks up are those with no payout yet, within the period. Selecting purely
 * by date would double-pay anything a previous run already covered, and the
 * unique index would then reject the whole run rather than skip the overlap.
 */
export async function runPayout(
  organiserId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<{
  payoutId: string;
  netCents: number;
  orders: number;
  subscriptionCents: number;
  months: number;
}> {
  if (periodEnd <= periodStart) throw new HttpError(400, "The period must end after it starts");

  const organiser = await prisma.user.findUnique({
    where: { id: organiserId },
    select: { id: true, role: true, bankAccount: { select: { id: true } } },
  });
  if (!organiser) throw new HttpError(404, "Organiser not found");
  // Refusing without bank details is the point: a PENDING payout nobody can
  // actually send is worse than no payout, because it reads as money on its
  // way.
  if (!organiser.bankAccount) {
    throw new HttpError(409, "This organiser has no bank details on file — add them before running a payout");
  }

  const fallback = await pricingPlanFor(organiserId);

  const payout = await prisma.$transaction(async (tx) => {
    const orders = await tx.order.findMany({
      where: {
        event: { organiserId },
        status: { in: ["PAID", "REFUNDED"] },
        createdAt: { gte: periodStart, lt: periodEnd },
        // Only what has never been paid. This, not the dates, is what makes
        // a re-run safe.
        payoutOrder: null,
      },
      select: { id: true, totalCents: true, refundedCents: true, feeCents: true, createdAt: true },
    });

    if (orders.length === 0) throw new HttpError(409, "Nothing to pay out for this period");

    const summary = summariseRevenue(
      orders.map((o) => ({ totalCents: o.totalCents, refundedCents: o.refundedCents, feeCents: o.feeCents })),
      fallback,
    );

    /*
     * The plan's fixed monthly fee, for each calendar month this period covers
     * that has not been billed yet.
     *
     * "Pro · 3% + 499/mo" used to charge only the 3%, which made Pro cheaper
     * than Starter's 5% at every volume — the tiers were backwards. Charging
     * it here rather than inventing a billing cycle means it is withheld from
     * money we already hold, and the organiser sees exactly what was taken.
     *
     * Months already billed are skipped, so two runs covering March bill it
     * once. The unique index on (organiserId, month) is the real guarantee;
     * this query just avoids provoking it.
     */
    const plan = await tx.user
      .findUnique({ where: { id: organiserId }, select: { plan: true } })
      .then((u) => u?.plan ?? null);
    const monthlyCents = plan?.monthlyCents ?? 0;

    let billableMonths: Date[] = [];
    if (monthlyCents > 0) {
      /*
       * Only months the organiser actually SOLD IN are billable.
       *
       * Billing every month the period spans sounds right until someone runs
       * a payout over a wide window to sweep up everything outstanding — the
       * UI's own default was 2020 to today, which is 120 months, or 59 880 MAD
       * of subscription against a few hundred of revenue. The run then refused
       * itself, which is a worse outcome than not charging: the organiser
       * cannot be paid at all.
       *
       * A subscription is for a month the platform carried their sales, so a
       * month with no orders in this payout is not one of them. Dormant months
       * are simply not charged rather than accrued as debt — a debt model is a
       * bigger decision than this run should make.
       */
      const monthsWithSales = new Set(orders.map((o) => monthStart(o.createdAt).getTime()));
      const covered = monthsInPeriod(periodStart, periodEnd).filter((month) =>
        monthsWithSales.has(month.getTime()),
      );
      const already = await tx.subscriptionCharge.findMany({
        where: { organiserId, month: { in: covered } },
        select: { month: true },
      });
      const billed = new Set(already.map((row) => row.month.getTime()));
      billableMonths = covered.filter((month) => !billed.has(month.getTime()));
    }
    const subscriptionCents = monthlyCents * billableMonths.length;

    /*
     * Subscription comes out of what is payable, and the result is floored at
     * zero rather than allowed to go negative: a quiet month must not turn a
     * payout into an invoice. The unbilled remainder is simply not collected,
     * which is the lenient direction — the alternative is a debt model, and
     * that is a bigger decision than this run should make on its own.
     */
    const netCents = Math.max(0, summary.payableCents - subscriptionCents);

    // A period of fully refunded orders nets zero. Recording it would create a
    // transfer of 0 MAD that someone has to action.
    if (summary.payableCents <= 0) {
      throw new HttpError(409, "This period nets nothing payable — every order in it was refunded");
    }
    if (netCents <= 0) {
      throw new HttpError(
        409,
        `This period nets ${(summary.payableCents / 100).toFixed(2)} MAD, which does not cover the ` +
          `${(subscriptionCents / 100).toFixed(2)} MAD plan subscription for it — nothing to transfer`,
      );
    }

    const created = await tx.payout.create({
      data: {
        organiserId,
        periodStart,
        periodEnd,
        grossCents: summary.netRevenueCents,
        feeCents: summary.feeCents,
        subscriptionCents,
        netCents,
        orders: {
          create: orders.map((o) => ({
            orderId: o.id,
            grossCents: o.totalCents - o.refundedCents,
            feeCents: feeAfterRefund(
              o.totalCents,
              o.refundedCents,
              o.feeCents ?? 0,
            ),
          })),
        },
        subscriptions: {
          create: billableMonths.map((month) => ({
            organiserId,
            month,
            amountCents: monthlyCents,
            // Copied so the charge can still be explained after a rate edit.
            planKey: plan!.key,
          })),
        },
      },
      select: { id: true, netCents: true },
    });

    return {
      payoutId: created.id,
      netCents: created.netCents,
      orders: orders.length,
      subscriptionCents,
      months: billableMonths.length,
    };
  });

  logger.info(
    {
      organiserId,
      payoutId: payout.payoutId,
      netCents: payout.netCents,
      orders: payout.orders,
      subscriptionCents: payout.subscriptionCents,
      months: payout.months,
    },
    "payout created",
  );
  return payout;
}

/**
 * Mark a payout as sent.
 *
 * `reference` is the bank's transfer id, and it is required: a payout marked
 * paid with nothing to trace it by cannot be reconciled against a statement,
 * which is the one thing this record exists for.
 */
export async function markPayoutPaid(payoutId: string, reference: string): Promise<void> {
  if (!reference.trim()) throw new HttpError(400, "A bank transfer reference is required");

  const claimed = await prisma.payout.updateMany({
    where: { id: payoutId, status: "PENDING" },
    data: { status: "PAID", reference: reference.trim(), paidAt: new Date() },
  });
  // Guarded rather than a plain update: marking an already-paid payout again
  // would overwrite the real reference and the date it actually went.
  if (claimed.count === 0) {
    const existing = await prisma.payout.findUnique({ where: { id: payoutId }, select: { status: true } });
    if (!existing) throw new HttpError(404, "Payout not found");
    throw new HttpError(409, `This payout is already ${existing.status.toLowerCase()}`);
  }
  logger.info({ payoutId, reference }, "payout marked paid");
}

/**
 * Abandon a PENDING payout, releasing its orders for a later run.
 *
 * Cancelling deletes the PayoutOrder rows, which is what frees the orders: the
 * unique index would otherwise keep them tied to a payout nobody will send.
 */
export async function cancelPayout(payoutId: string, note: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.payout.updateMany({
      where: { id: payoutId, status: "PENDING" },
      data: { status: "CANCELLED", note: note.trim() || null },
    });
    if (claimed.count === 0) {
      const existing = await tx.payout.findUnique({ where: { id: payoutId }, select: { status: true } });
      if (!existing) throw new HttpError(404, "Payout not found");
      // A sent transfer cannot be un-sent by editing a row.
      throw new HttpError(409, `Only a pending payout can be cancelled — this one is ${existing.status.toLowerCase()}`);
    }
    await tx.payoutOrder.deleteMany({ where: { payoutId } });
    // The subscription months go back too. Leaving them would block those
    // months from ever being billed, because the unique index would still see
    // them as charged by a payout nobody is going to send.
    await tx.subscriptionCharge.deleteMany({ where: { payoutId } });
  });
  logger.info({ payoutId }, "payout cancelled, orders and subscription months released");
}
