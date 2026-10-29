import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { summariseRevenue } from "../domain/commission.js";
import { cancelPayout, markPayoutPaid, organiserEarnings, runPayout } from "../lib/payout.js";
import { listAudit } from "../lib/audit.js";
import { AUDIT_ACTIONS, recordAudit } from "../lib/audit.js";

/**
 * The platform console — what someone running the marketplace needs, as
 * opposed to what an organiser needs.
 *
 * An admin's /pro dashboard was an ORGANISER dashboard with bigger numbers:
 * the same four tiles (encaissé, billets, entrées), summed across everyone
 * because scope.any widens the query. That answers "how are my events
 * doing", which an admin does not have. It does not answer how many
 * organisers exist, whether anyone is waiting for approval, how many of
 * them have never sold anything, or whether refunds are climbing.
 *
 * Gated on scope.any AND finance.view, not users.manage: this is money
 * across every organiser on the platform, so the two capabilities it
 * actually needs are "may act beyond your own rows" and "may see revenue".
 * users.manage is about editing accounts, which is a different question.
 */

export const platformRouter = Router();

platformRouter.use(authenticate, requirePermission("scope.any"), requirePermission("finance.view"));

/** Start of the UTC day, `days` ago. */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

platformRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const weekAgo = daysAgo(7);
    const prevWeek = daysAgo(14);

    const [
      usersByRole,
      ordersByStatus,
      eventsByStatus,
      ticketsByStatus,
      paidTotals,
      refundTotals,
      pendingApplications,
      newUsersThisWeek,
      paidThisWeek,
      paidPrevWeek,
    ] = await Promise.all([
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.event.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
      // Gross counts PAID and REFUNDED alike: a refunded order was still a
      // sale that happened. Netting them into one figure would hide the
      // refund rate, which is the number worth watching.
      prisma.order.aggregate({
        where: { status: { in: ["PAID", "REFUNDED"] } },
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
      prisma.order.aggregate({ _sum: { refundedCents: true } }),
      prisma.organiserApplication.count({ where: { status: "PENDING" } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.order.aggregate({
        where: { status: { in: ["PAID", "REFUNDED"] }, createdAt: { gte: weekAgo } },
        _sum: { totalCents: true },
      }),
      prisma.order.aggregate({
        where: { status: { in: ["PAID", "REFUNDED"] }, createdAt: { gte: prevWeek, lt: weekAgo } },
        _sum: { totalCents: true },
      }),
    ]);

    const countOf = <T extends string>(rows: Array<{ _count: { _all: number } }>, key: T, field: string) =>
      rows.find((r) => (r as unknown as Record<string, unknown>)[field] === key)?._count._all ?? 0;

    const grossCents = paidTotals._sum.totalCents ?? 0;
    const refundedCents = refundTotals._sum.refundedCents ?? 0;
    const thisWeekCents = paidThisWeek._sum.totalCents ?? 0;
    const prevWeekCents = paidPrevWeek._sum.totalCents ?? 0;

    res.json({
      users: {
        total: usersByRole.reduce((sum, r) => sum + r._count._all, 0),
        customers: countOf(usersByRole, "CUSTOMER", "role"),
        organisers: countOf(usersByRole, "ORGANISER", "role"),
        admins: countOf(usersByRole, "ADMIN", "role"),
        newThisWeek: newUsersThisWeek,
      },
      /** Waiting on an admin. The one number that is a to-do, not a metric. */
      pendingApplications,
      events: {
        published: countOf(eventsByStatus, "PUBLISHED", "status"),
        hidden: countOf(eventsByStatus, "HIDDEN", "status"),
        draft: countOf(eventsByStatus, "DRAFT", "status"),
        cancelled: countOf(eventsByStatus, "CANCELLED", "status"),
      },
      orders: {
        paid: countOf(ordersByStatus, "PAID", "status"),
        refunded: countOf(ordersByStatus, "REFUNDED", "status"),
        cancelled: countOf(ordersByStatus, "CANCELLED", "status"),
        pending: countOf(ordersByStatus, "PENDING", "status"),
      },
      tickets: {
        valid: countOf(ticketsByStatus, "VALID", "status"),
        used: countOf(ticketsByStatus, "USED", "status"),
        cancelled: countOf(ticketsByStatus, "CANCELLED", "status"),
        transferred: countOf(ticketsByStatus, "TRANSFERRED", "status"),
      },
      revenue: {
        grossCents,
        refundedCents,
        netCents: grossCents - refundedCents,
        /** Share of gross handed back, in basis points to stay integer. */
        refundRateBp: grossCents > 0 ? Math.round((refundedCents / grossCents) * 10_000) : 0,
        thisWeekCents,
        prevWeekCents,
      },
      generatedAt: new Date().toISOString(),
    });
  }),
);

/**
 * Everyone who runs events, ranked by what they have actually sold.
 *
 * The number that matters to a marketplace is not how many organisers
 * signed up but how many are selling — so this includes the ones with zero,
 * rather than filtering them out and hiding the problem.
 *
 * Selected by "holds the role OR owns events", not by role alone. The first
 * version filtered on role: "ORGANISER" and reported 3 events while the
 * platform had 17 — the other 14 belong to the admin account, which runs
 * house events and is invisible to a role filter. Anyone selling belongs on
 * a page about who is selling, whatever their role says.
 */
platformRouter.get(
  "/organisers",
  asyncHandler(async (_req, res) => {
    const organisers = await prisma.user.findMany({
      where: { OR: [{ role: "ORGANISER" }, { events: { some: {} } }] },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        events: { select: { id: true } },
        plan: { select: { key: true, label: true, rateBps: true, monthlyCents: true } },
      },
    });

    const defaultPlan = await prisma.plan.findFirst({ where: { isDefault: true } });

    const rows = await Promise.all(
      organisers.map(async (organiser) => {
        const eventIds = organiser.events.map((e) => e.id);
        // Net of refunds, not gross: a leaderboard that ranks by money since
        // returned to buyers flatters whoever refunds the most.
        const orders =
          eventIds.length === 0
            ? []
            : await prisma.order.findMany({
                where: { eventId: { in: eventIds }, status: { in: ["PAID", "REFUNDED"] } },
                select: { totalCents: true, refundedCents: true, feeCents: true },
              });
        // An unrecorded fee is priced at THIS organiser's plan, not the
        // platform default: charging a Pro organiser at Starter's rate was
        // the bug, and the row already knows which plan they are on.
        const totals = summariseRevenue(orders, organiser.plan ?? defaultPlan ?? undefined);

        return {
          id: organiser.id,
          name: organiser.name,
          email: organiser.email,
          // Surfaced because an ADMIN can appear here, and "why is the admin
          // on the organiser leaderboard" is a fair question the row should
          // answer itself.
          role: organiser.role,
          joinedAt: organiser.createdAt.toISOString(),
          events: eventIds.length,
          orders: orders.length,
          grossCents: totals.netRevenueCents,
          feeCents: totals.feeCents,
          plan: organiser.plan?.key ?? null,
          planLabel: organiser.plan?.label ?? null,
        };
      }),
    );

    rows.sort((a, b) => b.grossCents - a.grossCents || b.events - a.events);
    res.json({ organisers: rows });
  }),
);

// ─── Plans and payouts ───────────────────────────────────────────────────
//
// Commission used to be a browser-side calculation on a plan the organiser
// chose themselves, and "Reversement" named a payout that did not exist.
// These routes are the admin half of making both real.

/** The plans on offer, for the assignment dropdown. */
platformRouter.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
    res.json({
      plans: plans.map((plan) => ({
        key: plan.key,
        label: plan.label,
        rateBps: plan.rateBps,
        monthlyCents: plan.monthlyCents,
        isDefault: plan.isDefault,
      })),
    });
  }),
);

const assignPlanSchema = z.object({
  /** Null clears the assignment, putting the organiser back on the default. */
  planKey: z.string().nullable(),
});

/**
 * Put an organiser on a commission plan.
 *
 * Admin-only, by the router's scope.any + finance.view gate. Changing a plan
 * affects only FUTURE orders: the fee on each past order was recorded at
 * settlement and is deliberately not recomputed, so moving someone to a
 * cheaper plan cannot rewrite what they already owed.
 */
platformRouter.patch(
  "/organisers/:id/plan",
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const body = assignPlanSchema.parse(req.body ?? {});

    const organiser = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, planId: true } });
    if (!organiser) throw new HttpError(404, "User not found");

    if (body.planKey !== null) {
      const plan = await prisma.plan.findUnique({ where: { key: body.planKey } });
      if (!plan) throw new HttpError(400, "No such plan");
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { planId: body.planKey },
      select: { id: true, name: true, plan: { select: { key: true, label: true } } },
    });

    recordAudit(req, {
      action: AUDIT_ACTIONS.ORGANISER_PLAN_ASSIGNED,
      subjectType: "user",
      subjectId: updated.id,
      subjectLabel: updated.name,
      // Both ends, because "assigned Pro" alone does not say what it replaced.
      details: { from: organiser.planId ?? null, to: body.planKey },
    });

    res.json({
      id: updated.id,
      name: updated.name,
      plan: updated.plan?.key ?? null,
      planLabel: updated.plan?.label ?? null,
      // Says plainly that nothing historical moved, because "changed the
      // plan" invites exactly that assumption.
      note: "Applies to orders settled from now on; past commission is unchanged.",
    });
  }),
);

/** Every payout across the platform, newest first. */
platformRouter.get(
  "/payouts",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : null;
    const payouts = await prisma.payout.findMany({
      where: status === "PENDING" || status === "PAID" || status === "CANCELLED" ? { status } : {},
      select: {
        id: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        grossCents: true,
        feeCents: true,
        subscriptionCents: true,
        netCents: true,
        reference: true,
        createdAt: true,
        paidAt: true,
        organiser: {
          select: {
            id: true,
            name: true,
            email: true,
            bankAccount: { select: { holderName: true, rib: true, bank: true } },
          },
        },
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      payouts: payouts.map((p) => ({
        id: p.id,
        status: p.status,
        organiserId: p.organiser.id,
        organiserName: p.organiser.name,
        organiserEmail: p.organiser.email,
        periodStart: p.periodStart.toISOString(),
        periodEnd: p.periodEnd.toISOString(),
        grossCents: p.grossCents,
        feeCents: p.feeCents,
        subscriptionCents: p.subscriptionCents,
        netCents: p.netCents,
        orders: p._count.orders,
        reference: p.reference,
        createdAt: p.createdAt.toISOString(),
        paidAt: p.paidAt?.toISOString() ?? null,
        // Whoever actions the transfer needs the account. Full RIB here and
        // nowhere else: this route is already behind scope.any + finance.view,
        // and a transfer cannot be made from the last four digits.
        bank: p.organiser.bankAccount
          ? {
              holderName: p.organiser.bankAccount.holderName,
              rib: p.organiser.bankAccount.rib,
              bank: p.organiser.bankAccount.bank,
            }
          : null,
      })),
    });
  }),
);

/** What an organiser is owed right now, before committing to a run. */
platformRouter.get(
  "/organisers/:id/earnings",
  asyncHandler(async (req, res) => {
    res.json(await organiserEarnings(param(req, "id")));
  }),
);

const runPayoutSchema = z.object({
  /** Inclusive start, ISO date or datetime. */
  periodStart: z.string(),
  /** EXCLUSIVE end, so consecutive months do not overlap by a day. */
  periodEnd: z.string(),
});

/**
 * Create a payout for one organiser over one period.
 *
 * Safe to re-run: it only picks up orders that are not already in a payout,
 * so an overlapping period tops up rather than double-paying. The unique
 * index on PayoutOrder.orderId is the backstop if two runs race.
 */
platformRouter.post(
  "/organisers/:id/payouts",
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const body = runPayoutSchema.parse(req.body ?? {});
    const start = new Date(body.periodStart);
    const end = new Date(body.periodEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new HttpError(400, "periodStart and periodEnd must be valid dates");
    }
    const organiserId = param(req, "id");
    const result = await runPayout(organiserId, start, end);
    recordAudit(req, {
      action: AUDIT_ACTIONS.PAYOUT_CREATED,
      subjectType: "payout",
      subjectId: result.payoutId,
      subjectLabel: `${(result.netCents / 100).toFixed(2)} MAD`,
      details: {
        organiserId,
        netCents: result.netCents,
        orders: result.orders,
        subscriptionCents: result.subscriptionCents,
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
      },
    });
    res.status(201).json(result);
  }),
);

const markPaidSchema = z.object({
  /** The bank's transfer reference. Required — see markPayoutPaid. */
  reference: z.string().min(1),
});

platformRouter.post(
  "/payouts/:id/paid",
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const body = markPaidSchema.parse(req.body ?? {});
    const payoutId = param(req, "id");
    await markPayoutPaid(payoutId, body.reference);
    // Says money left the bank. Nothing in the system verifies that, so the
    // record of who asserted it is the only accountability there is.
    recordAudit(req, {
      action: AUDIT_ACTIONS.PAYOUT_PAID,
      subjectType: "payout",
      subjectId: payoutId,
      details: { reference: body.reference },
    });
    res.json({ ok: true });
  }),
);

platformRouter.post(
  "/payouts/:id/cancel",
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const note = typeof req.body?.note === "string" ? req.body.note : "";
    const payoutId = param(req, "id");
    await cancelPayout(payoutId, note);
    recordAudit(req, {
      action: AUDIT_ACTIONS.PAYOUT_CANCELLED,
      subjectType: "payout",
      subjectId: payoutId,
      details: { note: note || null },
    });
    res.json({ ok: true });
  }),
);

// ─── The journal ─────────────────────────────────────────────────────────
//
// Reading it needs the same gate as the rest of this router (scope.any +
// finance.view): the rows describe money moving and accounts changing across
// every organiser, which is precisely what those two capabilities mean.

platformRouter.get(
  "/audit",
  asyncHandler(async (req, res) => {
    const str = (key: string) => (typeof req.query[key] === "string" ? (req.query[key] as string) : undefined);
    const beforeRaw = str("before");
    const before = beforeRaw ? new Date(beforeRaw) : undefined;
    if (before && Number.isNaN(before.getTime())) throw new HttpError(400, "`before` must be a valid date");

    const events = await listAudit({
      action: str("action"),
      actorId: str("actorId"),
      subjectType: str("subjectType"),
      subjectId: str("subjectId"),
      before,
      limit: Number(str("limit") ?? 50),
    });

    res.json({
      events,
      // The vocabulary, so the filter dropdown does not hardcode a list that
      // drifts from what the server actually records.
      actions: Object.values(AUDIT_ACTIONS),
    });
  }),
);
