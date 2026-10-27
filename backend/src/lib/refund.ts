import { prisma } from "./prisma.js";
import { HttpError } from "./http.js";
import { getStripe, isMockPayments } from "./stripe.js";
import { sendEmail } from "./email.js";
import { refundHtml, refundSubject } from "./email-templates.js";
import { logger } from "./logger.js";
import { offerFreedSeats } from "./waitlist.js";

/**
 * Refund — money actually returned to the buyer.
 *
 * Deliberately separate from `cancel`, which flips statuses and releases
 * inventory without moving money. Both exist because an organiser sometimes
 * needs one without the other: voiding a fraudulent order (cancel) is not the
 * same act as paying someone back (refund).
 *
 * A partial refund leaves the tickets valid — refunding one seat of four
 * shouldn't void the other three. Only a full refund voids the tickets and
 * returns the seats to the pool.
 */
export async function refundOrder(
  orderId: string,
  amountCents: number | null,
): Promise<{ refundedCents: number; full: boolean; refundRef: string }> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { event: true } });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.status !== "PAID") throw new HttpError(409, "Only a paid order can be refunded");

  const outstanding = order.totalCents - order.refundedCents;
  if (outstanding <= 0) throw new HttpError(409, "Order is already fully refunded");

  const amount = amountCents ?? outstanding;
  if (amount <= 0) throw new HttpError(400, "Refund amount must be positive");
  if (amount > outstanding) throw new HttpError(400, "Refund exceeds the amount still refundable");

  const refundedTotal = order.refundedCents + amount;
  const full = refundedTotal >= order.totalCents;

  /*
   * Claim the amount in the database BEFORE calling Stripe.
   *
   * The guard `refundedCents: order.refundedCents` makes this a
   * compare-and-swap: of two concurrent refunds that both read the same
   * starting balance, exactly one update matches and the loser is rejected
   * without ever reaching the gateway. Doing it the other way round — charge
   * first, record after — is how a buyer gets paid twice while the ledger
   * shows one refund.
   *
   * If the Stripe call then fails we roll the claim back below, which risks
   * at worst a refund the books show as unmade; the opposite ordering risks
   * money leaving twice, which is the costlier failure.
   */
  const claimed = await prisma.order.updateMany({
    where: { id: order.id, status: "PAID", refundedCents: order.refundedCents },
    data: { refundedCents: refundedTotal, refundedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new HttpError(409, "Another refund for this order is already in progress");
  }

  let refundRef: string;
  if (isMockPayments() || !order.paymentIntentId) {
    // No gateway to call: record the refund so the books are consistent, and
    // make it obvious in the reference that no card was touched.
    refundRef = `MOCK-REFUND-${Date.now()}`;
  } else {
    const stripe = getStripe()!;
    try {
      const refund = await stripe.refunds.create(
        { payment_intent: order.paymentIntentId, amount },
        // Keyed to the running total, so a retry of THIS refund is a no-op at
        // Stripe while a genuine second refund gets its own key.
        { idempotencyKey: `refund_${order.id}_${refundedTotal}` },
      );
      refundRef = refund.id;
    } catch (err) {
      // Release the claim so the organiser can retry; leaving it would make
      // the order look partly refunded when no money moved.
      await prisma.order.updateMany({
        where: { id: order.id, refundedCents: refundedTotal },
        data: { refundedCents: order.refundedCents, refundedAt: order.refundedAt },
      });
      logger.warn({ err, orderId: order.id }, "stripe refund failed — claim released");
      throw new HttpError(502, "The payment provider refused the refund. Nothing was charged back.");
    }
  }

  await prisma.$transaction(async (tx) => {
    // refundedCents/refundedAt were already claimed above; this only records
    // the provider reference and, on a full refund, voids the tickets.
    await tx.order.update({
      where: { id: order.id },
      data: { refundRef, ...(full ? { status: "REFUNDED" as const } : {}) },
    });
    // Only a full refund voids the tickets; a partial one leaves them usable.
    if (full) {
      await tx.ticket.updateMany({ where: { orderId: order.id }, data: { status: "CANCELLED" } });
    }
  });

  // A full refund returns seats to the pool — offer them to whoever is
  // waiting. Fire-and-forget: the refund already happened.
  if (full) void offerFreedSeats(order.eventId);

  void sendEmail({
    to: order.email,
    subject: refundSubject({
      locale: "fr",
      holderName: order.holderName,
      eventTitle: order.event.titleFr,
      amountCents: amount,
      orderId: order.id,
    }),
    html: refundHtml({
      locale: "fr",
      holderName: order.holderName,
      eventTitle: order.event.titleFr,
      amountCents: amount,
      orderId: order.id,
    }),
  }).catch((err) => logger.warn({ err, orderId: order.id }, "refund email failed"));

  return { refundedCents: refundedTotal, full, refundRef };
}

/**
 * Record a refund that happened AT STRIPE, not here.
 *
 * An organiser can refund from the Stripe dashboard, and a card network can
 * force one through a dispute. Either way the money is already gone, so this
 * must never call `stripe.refunds.create` — that would refund a refund. It
 * reconciles our ledger with what Stripe reports and applies the same
 * consequences as `refundOrder`: a full refund voids the tickets and returns
 * the seats, a partial one leaves them usable.
 *
 * `amountRefundedCents` is the running total Stripe holds for the charge, not
 * a delta, so this is idempotent — a replayed webhook writes the same number.
 */
export async function reconcileExternalRefund(
  paymentIntentId: string,
  amountRefundedCents: number,
): Promise<{ orderId: string; full: boolean } | null> {
  const order = await prisma.order.findUnique({ where: { paymentIntentId } });
  if (!order) return null;

  // Stripe's total is authoritative. If we already recorded at least this
  // much, our own refund path handled it and there is nothing to do.
  if (order.refundedCents >= amountRefundedCents) return null;

  const full = amountRefundedCents >= order.totalCents;

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        refundedCents: amountRefundedCents,
        refundedAt: order.refundedAt ?? new Date(),
        ...(full ? { status: "REFUNDED" as const } : {}),
      },
    });
    // The point of the whole function: a buyer who got their money back must
    // not still get through the gate.
    if (full) {
      await tx.ticket.updateMany({
        where: { orderId: order.id, status: { in: ["VALID", "USED"] } },
        data: { status: "CANCELLED" },
      });
    }
  });

  if (full) void offerFreedSeats(order.eventId);

  logger.info(
    { orderId: order.id, amountRefundedCents, full },
    "external refund reconciled from stripe",
  );
  return { orderId: order.id, full };
}
