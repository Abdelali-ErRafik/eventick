import { prisma } from "./prisma.js";
import { tierRemaining } from "../domain/inventory.js";

/** Committed = PAID orders, plus PENDING orders whose hold hasn't expired yet.
 * Expired holds don't block other buyers — see routes/orders.ts checkout,
 * which re-validates this inside the same transaction before committing. */
export async function remainingByTier(eventId: string): Promise<Record<string, number>> {
  const tiers = await prisma.ticketTier.findMany({ where: { eventId } });
  const lines = await prisma.orderLine.findMany({
    where: {
      tier: { eventId },
      order: {
        OR: [{ status: "PAID" }, { status: "PENDING", holdUntil: { gt: new Date() } }],
      },
    },
  });

  const committed = new Map<string, number>();
  for (const line of lines) {
    committed.set(line.tierId, (committed.get(line.tierId) ?? 0) + line.qty);
  }

  const result: Record<string, number> = {};
  for (const tier of tiers) {
    result[tier.id] = tierRemaining(tier.capacity, committed.get(tier.id) ?? 0);
  }
  return result;
}
