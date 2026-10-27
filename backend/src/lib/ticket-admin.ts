import { prisma } from "./prisma.js";
import { HttpError } from "./http.js";
import { makeTicketRef } from "../domain/ticketRef.js";
import { seatFor } from "../domain/inventory.js";
import { refundOrder } from "./refund.js";
import { offerFreedSeats } from "./waitlist.js";
import { logger } from "./logger.js";

/**
 * Ticket lifecycle operations that sit between "view it" and "scan it":
 * self-cancellation, exchange between zones, reissue, and renaming the holder.
 *
 * Common rules, enforced here rather than repeated per route:
 *  - a USED ticket is history; nothing may change it
 *  - a CANCELLED or TRANSFERRED ticket is no longer the holder's to alter
 *  - the money side always goes through refundOrder, so one ledger records it
 */

type TicketWithContext = Awaited<ReturnType<typeof loadTicket>>;

export async function loadTicket(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { tier: true, order: { include: { event: true } } },
  });
  if (!ticket) throw new HttpError(404, "Ticket not found");
  return ticket;
}

/** A ticket can only be altered while it is still a live, unused entitlement. */
function assertAlterable(ticket: TicketWithContext): void {
  if (ticket.status === "USED") throw new HttpError(409, "This ticket has already been used at the gate");
  if (ticket.status === "CANCELLED") throw new HttpError(409, "This ticket is cancelled");
  if (ticket.status === "TRANSFERRED") throw new HttpError(409, "This ticket was transferred to someone else");
}

/** Hours remaining before the event starts. Negative once it has begun. */
function hoursUntilStart(startAt: Date): number {
  return (startAt.getTime() - Date.now()) / 3_600_000;
}

export interface CancelPolicy {
  allowed: boolean;
  cutoffHours: number;
  hoursLeft: number;
  reason?: string;
}

/**
 * Whether the BUYER may cancel this themselves right now.
 *
 * Exposed so the UI can show the deadline and hide the button rather than
 * offering an action that will fail — the organiser can always cancel.
 */
export function cancelPolicy(ticket: TicketWithContext): CancelPolicy {
  const cutoffHours = ticket.order.event.cancelCutoffHours;
  const hoursLeft = hoursUntilStart(ticket.order.event.startAt);

  if (cutoffHours === 0) {
    return { allowed: false, cutoffHours, hoursLeft, reason: "self-cancel-disabled" };
  }
  if (ticket.status !== "VALID") {
    return { allowed: false, cutoffHours, hoursLeft, reason: "not-valid" };
  }
  if (hoursLeft < cutoffHours) {
    return { allowed: false, cutoffHours, hoursLeft, reason: "past-cutoff" };
  }
  return { allowed: true, cutoffHours, hoursLeft };
}

/**
 * Buyer cancels their own ticket and is refunded its face value.
 *
 * Refunds the ticket's price rather than the whole order, because an order
 * can hold several tickets and cancelling one shouldn't void the rest.
 */
export async function selfCancelTicket(ticketId: string): Promise<{ refundedCents: number }> {
  const ticket = await loadTicket(ticketId);
  assertAlterable(ticket);

  const policy = cancelPolicy(ticket);
  if (!policy.allowed) {
    if (policy.reason === "self-cancel-disabled") {
      throw new HttpError(409, "This organiser does not allow self-cancellation — please contact them");
    }
    throw new HttpError(
      409,
      `Cancellation closed ${policy.cutoffHours}h before the event. Please contact the organiser.`,
    );
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  // Refund only this seat's share. A fully-refunded order is handled by
  // refundOrder itself (it flips the order to REFUNDED and voids the rest).
  let refundedCents = 0;
  try {
    const result = await refundOrder(ticket.orderId, ticket.tier.priceCents);
    refundedCents = ticket.tier.priceCents;
    logger.info({ ticketId, refundedCents: result.refundedCents }, "ticket self-cancelled and refunded");
  } catch (err) {
    // The ticket is already void; a refund failure must be visible, not silent.
    logger.warn({ err, ticketId }, "self-cancel refund failed — ticket voided, money not returned");
    throw new HttpError(502, "The ticket was cancelled but the refund failed. Please contact support.");
  }

  void offerFreedSeats(ticket.order.eventId);
  return { refundedCents };
}

/**
 * Move a ticket to another zone of the same event.
 *
 * Upgrades owe the difference, which the caller collects before this runs.
 * Downgrades keep the original value: refunding the difference would let
 * someone buy the dearest seat and downgrade purely to extract a refund.
 */
export async function exchangeTicket(
  ticketId: string,
  targetTierId: string,
): Promise<{ ticketId: string; seatRow: number | null; seatNumber: number | null }> {
  const ticket = await loadTicket(ticketId);
  assertAlterable(ticket);

  if (targetTierId === ticket.tierId) throw new HttpError(400, "The ticket is already in that zone");

  return prisma.$transaction(async (tx) => {
    const target = await tx.ticketTier.findUnique({ where: { id: targetTierId } });
    if (!target) throw new HttpError(404, "Zone not found");
    if (target.eventId !== ticket.order.eventId) {
      throw new HttpError(400, "That zone belongs to a different event");
    }

    // What the target zone already owes — issued tickets plus live holds,
    // matching lib/availability.ts. Counting paid ORDERS would miss a resold
    // seat, whose order is REFUNDED but whose ticket is still valid.
    const issued = await tx.ticket.count({
      where: { tierId: targetTierId, status: { in: ["VALID", "USED"] } },
    });
    const holds = await tx.orderLine.findMany({
      where: { tierId: targetTierId, order: { status: "PENDING", holdUntil: { gt: new Date() } } },
      select: { qty: true },
    });
    const committed = issued + holds.reduce((sum, line) => sum + line.qty, 0);
    if (committed >= target.capacity) throw new HttpError(409, "That zone is sold out");

    // Numbered zones need a seat; take the next one in the row layout.
    let seatRow: number | null = null;
    let seatNumber: number | null = null;
    if (target.numbered) {
      const seat = seatFor(committed + 1, target.seatsPerRow);
      seatRow = seat.row;
      seatNumber = seat.seat;
    }

    await tx.ticket.update({
      where: { id: ticketId },
      data: { tierId: targetTierId, seatRow, seatNumber },
    });

    // Move the order line too, so inventory counts stay honest for both zones.
    const line = await tx.orderLine.findFirst({ where: { orderId: ticket.orderId, tierId: ticket.tierId } });
    if (line) {
      if (line.qty <= 1) {
        await tx.orderLine.update({ where: { id: line.id }, data: { tierId: targetTierId } });
      } else {
        await tx.orderLine.update({ where: { id: line.id }, data: { qty: line.qty - 1 } });
        await tx.orderLine.create({ data: { orderId: ticket.orderId, tierId: targetTierId, qty: 1 } });
      }
    }

    return { ticketId, seatRow, seatNumber };
  });
}

/**
 * Reissue a lost ticket: the old reference and its QR stop working, and a
 * fresh one takes its place.
 *
 * Voiding the old ref is the point — a reissue exists because the original
 * may be in someone else's hands, so leaving it valid would admit two people.
 */
export async function reissueTicket(ticketId: string): Promise<{ id: string; ref: string; previousRef: string }> {
  const ticket = await loadTicket(ticketId);
  assertAlterable(ticket);

  return prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticketId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    const replacement = await tx.ticket.create({
      data: {
        ref: makeTicketRef(ticket.order.event.startAt.getFullYear()),
        orderId: ticket.orderId,
        tierId: ticket.tierId,
        holderName: ticket.holderName,
        seatRow: ticket.seatRow,
        seatNumber: ticket.seatNumber,
        replacesRef: ticket.ref,
      },
    });

    return { id: replacement.id, ref: replacement.ref, previousRef: ticket.ref };
  });
}

/**
 * Correct the holder's name.
 *
 * Distinct from a transfer: a transfer hands the ticket to someone else and
 * marks the original TRANSFERRED, while this just fixes a spelling so the
 * name matches the ID presented at the gate.
 */
export async function renameHolder(ticketId: string, holderName: string): Promise<void> {
  const ticket = await loadTicket(ticketId);
  assertAlterable(ticket);
  await prisma.ticket.update({ where: { id: ticketId }, data: { holderName: holderName.trim() } });
}
