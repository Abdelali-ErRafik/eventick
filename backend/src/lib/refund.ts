import { prisma } from "./prisma.js";
import { HttpError } from "./http.js";
import { isMockPayments } from "./cmi.js";
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
   * Claim the amount in the database with a compare-and-swap.
   *
   * The guard `refundedCents: order.refundedCents` means that of two
   * concurrent refunds reading the same starting balance, exactly one update
   * matches and the loser is rejected. Doing it the other way round — pay
   * first, record after — is how a buyer gets paid twice while the ledger
   * shows one refund.
   */
  const claimed = await prisma.order.updateMany({
    where: { id: order.id, status: "PAID", refundedCents: order.refundedCents },
    data: { refundedCents: refundedTotal, refundedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new HttpError(409, "Another refund for this order is already in progress");
  }

  /*
   * CMI has NO refund API: a merchant reverses a transaction in the CMI back
   * office, by hand. So unlike the Stripe integration this replaces, nothing
   * here moves money — this records the decision, voids the tickets and
   * emails the buyer, and the payout itself is a manual step.
   *
   * That makes the reference the important part: it has to say plainly that
   * the money has not left yet, so a refund nobody actioned in the back
   * office is visible as such rather than looking settled. `gatewayRef` is
   * the CMI transaction to reverse.
   */
  const refundRef =
    isMockPayments() || !order.gatewayRef
      ? `MOCK-REFUND-${Date.now()}`
      : `CMI-MANUAL-${order.gatewayRef}`;

  if (!isMockPayments()) {
    logger.warn(
      { orderId: order.id, gatewayRef: order.gatewayRef, amount },
      "REFUND RECORDED — reverse this transaction in the CMI back office; no money has moved yet",
    );
  }

  await prisma.$transaction(async (tx) => {
    // refundedCents/refundedAt were already claimed above; this only records
    // the provider reference and, on a full refund, voids the tickets.
    await tx.order.update({
      where: { id: order.id },
      data: { refundRef, ...(full ? { status: "REFUNDED" as const } : {}) },
    });
    /*
     * Only a full refund voids the tickets; a partial one leaves them usable.
     *
     * TRANSFERRED is excluded deliberately. A resale refunds the seller their
     * face value, which is a FULL refund of their order — so without this
     * filter it overwrote the ticket it had just marked TRANSFERRED, and the
     * seat's history read "refunded" rather than "sold on". Both states block
     * entry, so nothing was exploitable, but the gate tells a turned-away
     * holder which of the two happened, and support cannot answer "where did
     * my ticket go" from a status that lost the distinction.
     */
    if (full) {
      await tx.ticket.updateMany({
        where: { orderId: order.id, status: { not: "TRANSFERRED" } },
        data: { status: "CANCELLED" },
      });
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
 * Record a refund that happened IN THE CMI BACK OFFICE, not here.
 *
 * CMI sends no notification when a merchant reverses a transaction there, so
 * nothing calls this automatically — it is reconciliation, invoked when
 * someone notices the books disagree with CMI's. It must never try to move
 * money: the money is already gone. It applies the same consequences as
 * `refundOrder`, so a buyer who got their money back cannot still walk in: a
 * full refund voids the tickets and returns the seats, a partial one leaves
 * them usable.
 *
 * `amountRefundedCents` is the running TOTAL reversed for the transaction,
 * not a delta, so running this twice writes the same number.
 */
export async function reconcileExternalRefund(
  gatewayRef: string,
  amountRefundedCents: number,
): Promise<{ orderId: string; full: boolean } | null> {
  const order = await prisma.order.findUnique({ where: { gatewayRef } });
  if (!order) return null;

  // The gateway's total is authoritative. If we already recorded at least
  // this much, our own refund path handled it and there is nothing to do.
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
    "external refund reconciled from the CMI back office",
  );
  return { orderId: order.id, full };
}
