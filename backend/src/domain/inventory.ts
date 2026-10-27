/** Max tickets a single order line may request for one tier — matches the
 * stepper limit in the original frontend's event detail page. */
export const MAX_QTY_PER_TIER = 8;

/** Minutes a PENDING order holds its claimed inventory before the seats
 * return to the pool. Server-authoritative: the client's countdown is a
 * display of this, not a source of truth. */
export const HOLD_MINUTES = 15;

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

export const DEFAULT_SEATS_PER_ROW = 12;

/** Numbered-tier seat assignment, 1-indexed. Row width comes from the tier so
 * a venue can describe its real layout; 12 stays the default, which is what
 * the original client-side `placeOrder` math assumed for every room. */
export function seatFor(cursor: number, seatsPerRow = DEFAULT_SEATS_PER_ROW): { row: number; seat: number } {
  const width = seatsPerRow > 0 ? seatsPerRow : DEFAULT_SEATS_PER_ROW;
  return { row: Math.ceil(cursor / width), seat: ((cursor - 1) % width) + 1 };
}
