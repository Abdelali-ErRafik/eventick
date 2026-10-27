import { prisma } from "./prisma.js";
import { tierRemaining } from "../domain/inventory.js";

/**
 * Seats of ONE tier that someone already holds.
 *
 * The single definition of "committed", so the half-dozen places that ask the
 * question cannot drift apart. Counts issued tickets plus live holds — NOT
 * paid orders, because a resold seat leaves the seller's order REFUNDED while
 * the buyer's ticket is still valid.
 */
export async function committedForTier(tierId: string): Promise<number> {
  const [issued, pending] = await Promise.all([
    prisma.ticket.count({ where: { tierId, status: { in: ["VALID", "USED"] } } }),
    prisma.orderLine.findMany({
      where: { tierId, order: { status: "PENDING", holdUntil: { gt: new Date() } } },
      select: { qty: true },
    }),
  ]);
  return issued + pending.reduce((sum, line) => sum + line.qty, 0);
}

/**
 * Committed = seats someone actually holds.
 *
 * Counted from LIVE TICKETS rather than order status, plus PENDING holds that
 * have no tickets yet. Order status alone is wrong once resale exists: a
 * resold seat leaves the seller's order REFUNDED while the buyer's ticket is
 * still valid, so counting orders would release that seat back into the pool
 * AND give it to the buyer — selling the same seat twice.
 *
 * Expired holds don't block anyone — routes/orders.ts re-validates this inside
 * the order transaction before committing.
 */
export async function remainingByTier(eventId: string): Promise<Record<string, number>> {
  const tiers = await prisma.ticketTier.findMany({ where: { eventId } });

  // Issued seats that still entitle someone to enter. USED counts too: the
  // person is inside, so the seat is not available to sell again.
  const issued = await prisma.ticket.groupBy({
    by: ["tierId"],
    where: { tier: { eventId }, status: { in: ["VALID", "USED"] } },
    _count: { _all: true },
  });

  const committed = new Map<string, number>();
  for (const row of issued) {
    committed.set(row.tierId, row._count._all);
  }

  // Holds that haven't produced tickets yet still reserve their seats.
  const pending = await prisma.orderLine.findMany({
    where: {
      tier: { eventId },
      order: { status: "PENDING", holdUntil: { gt: new Date() } },
    },
  });
  for (const line of pending) {
    committed.set(line.tierId, (committed.get(line.tierId) ?? 0) + line.qty);
  }

  const result: Record<string, number> = {};
  for (const tier of tiers) {
    result[tier.id] = tierRemaining(tier.capacity, committed.get(tier.id) ?? 0);
  }
  return result;
}
