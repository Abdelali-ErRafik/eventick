/** Max tickets a single order line may request for one tier — matches the
 * stepper limit in the original frontend's event detail page. */
export const MAX_QTY_PER_TIER = 8;

/** Minutes an order holds its claimed inventory before it's released back to
 * the pool. Matches the original client-side `holdUntil` countdown. */
export const HOLD_MINUTES = 8;

export function holdExpiry(now = new Date()): Date {
  return new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);
}

export function isHoldExpired(holdUntil: Date | null, now = new Date()): boolean {
  return holdUntil !== null && holdUntil.getTime() < now.getTime();
}

/** How many seats of a tier are still claimable, given how many are already
 * committed to PAID or still-held PENDING orders. */
export function tierRemaining(capacity: number, committed: number): number {
  return Math.max(0, capacity - committed);
}

export function checkQuantity(qty: number, remaining: number): { ok: boolean; reason?: string } {
  if (qty < 1) return { ok: false, reason: "Quantity must be at least 1" };
  if (qty > MAX_QTY_PER_TIER) return { ok: false, reason: `Quantity cannot exceed ${MAX_QTY_PER_TIER}` };
  if (qty > remaining) return { ok: false, reason: "Not enough tickets remaining" };
  return { ok: true };
}

/** Numbered-tier seat assignment: 12 seats per row, 1-indexed, matching the
 * original client-side `placeOrder` math in src/lib/store.ts. */
export function seatFor(cursor: number): { row: number; seat: number } {
  return { row: Math.ceil(cursor / 12), seat: ((cursor - 1) % 12) + 1 };
}
