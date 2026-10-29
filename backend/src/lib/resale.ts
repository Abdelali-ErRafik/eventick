import { randomBytes } from "node:crypto";
import { prisma } from "./prisma.js";
import { HttpError } from "./http.js";
import { makeTicketRef } from "../domain/ticketRef.js";
import { refundOrder } from "./refund.js";
import { logger } from "./logger.js";

/**
 * Resale — platform-mediated, at face value.
 *
 * The buyer pays Eventick, the seller is refunded what they originally paid,
 * and a fresh ticket is issued to the buyer while the seller's is voided.
 * Nobody hands money to a stranger, and the old QR stops working the moment
 * the sale completes, so a ticket can never be presented twice.
 *
 * Face value is copied onto the listing rather than read live, so an
 * organiser changing a tier price later cannot alter what a listed ticket
 * costs — the buyer pays what the listing showed.
 */

export async function listTicketForResale(ticketId: string, sellerId: string | null) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { tier: true, order: { include: { event: true } }, resale: true },
  });
  if (!ticket) throw new HttpError(404, "Ticket not found");
  if (ticket.status !== "VALID") throw new HttpError(409, "Only a valid ticket can be resold");
  /*
   * Resale is OPT-IN per event, and off by default.
   *
   * It is a secondary market: genuinely useful when an organiser wants one,
   * but making every event a reseller venue is the organiser's decision, not
   * a platform default. Gated here rather than only in the UI, so the API
   * cannot be used to list against an event that never enabled it.
   *
   * Existing listings are untouched — this gates NEW ones, so nothing in
   * flight breaks when an organiser turns it off.
   */
  if (!ticket.order.event.allowResale) {
    throw new HttpError(409, "The organiser has not enabled resale for this event");
  }
  if (ticket.order.event.startAt.getTime() < Date.now()) {
    throw new HttpError(409, "This event has already started");
  }

  // One live listing per ticket. A previous CANCELLED listing may be replaced;
  // the unique constraint is on ticketId, so reuse the row rather than insert.
  if (ticket.resale) {
    if (ticket.resale.status === "LISTED") throw new HttpError(409, "This ticket is already listed");
    if (ticket.resale.status === "SOLD") throw new HttpError(409, "This ticket has already been resold");
    const relisted = await prisma.resaleListing.update({
      where: { id: ticket.resale.id },
      data: {
        status: "LISTED",
        priceCents: ticket.tier.priceCents,
        token: randomBytes(24).toString("base64url"),
        sellerId,
        soldAt: null,
        closedAt: null,
        buyerOrderId: null,
        newTicketId: null,
      },
    });
    return relisted;
  }

  return prisma.resaleListing.create({
    data: {
      ticketId,
      sellerId,
      priceCents: ticket.tier.priceCents,
      token: randomBytes(24).toString("base64url"),
    },
  });
}

export async function cancelListing(listingId: string): Promise<void> {
  const claimed = await prisma.resaleListing.updateMany({
    where: { id: listingId, status: "LISTED" },
    data: { status: "CANCELLED", closedAt: new Date() },
  });
  if (claimed.count === 0) throw new HttpError(409, "This listing is no longer open");
}

/** A listing a buyer can still act on, or null. */
export async function resolveListing(token: string) {
  const listing = await prisma.resaleListing.findUnique({
    where: { token },
    include: { ticket: { include: { tier: true, order: { include: { event: true } } } } },
  });
  if (!listing || listing.status !== "LISTED") return null;
  // A ticket that changed hands or got used since listing is no longer sellable.
  if (listing.ticket.status !== "VALID") return null;
  if (listing.ticket.order.event.startAt.getTime() < Date.now()) return null;
  return listing;
}

/**
 * Complete a resale: void the seller's ticket, issue the buyer's, refund the
 * seller.
 *
 * Called once the buyer's order is PAID. The listing is claimed with a
 * guarded update first, so two simultaneous buyers cannot both complete —
 * the loser is told it has gone.
 */
export async function completeResale(
  listingId: string,
  buyerOrderId: string,
): Promise<{ newTicketId: string; newRef: string }> {
  const claimed = await prisma.resaleListing.updateMany({
    where: { id: listingId, status: "LISTED" },
    data: { status: "SOLD", soldAt: new Date(), buyerOrderId },
  });
  if (claimed.count === 0) throw new HttpError(409, "This listing has already been sold");

  const listing = await prisma.resaleListing.findUniqueOrThrow({
    where: { id: listingId },
    include: { ticket: { include: { tier: true, order: { include: { event: true } } } } },
  });

  const result = await prisma.$transaction(async (tx) => {
    // The seller's ticket stops working.
    await tx.ticket.update({
      where: { id: listing.ticketId },
      data: { status: "TRANSFERRED" },
    });

    const buyerOrder = await tx.order.findUniqueOrThrow({ where: { id: buyerOrderId } });

    // A fresh reference, so the seller's QR cannot admit the new owner's seat.
    const replacement = await tx.ticket.create({
      data: {
        ref: makeTicketRef(listing.ticket.order.event.startAt.getFullYear()),
        orderId: buyerOrderId,
        tierId: listing.ticket.tierId,
        holderName: buyerOrder.holderName,
        seatRow: listing.ticket.seatRow,
        seatNumber: listing.ticket.seatNumber,
        replacesRef: listing.ticket.ref,
      },
    });

    await tx.resaleListing.update({
      where: { id: listingId },
      data: { newTicketId: replacement.id },
    });

    return { newTicketId: replacement.id, newRef: replacement.ref };
  });

  // Refund the seller their face value. After the transaction: the buyer owns
  // a working ticket either way, and a refund failure must be visible rather
  // than rolling back a completed sale.
  try {
    await refundOrder(listing.ticket.orderId, listing.priceCents);
    logger.info({ listingId, refunded: listing.priceCents }, "resale complete, seller refunded");
  } catch (err) {
    logger.error({ err, listingId }, "RESALE SELLER REFUND FAILED — manual payout required");
  }

  return result;
}
