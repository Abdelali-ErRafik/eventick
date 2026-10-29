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

// ─── Sales windows ────────────────────────────────────────────────────────

export interface SalesWindow {
  salesStartAt: Date | null;
  salesEndAt: Date | null;
}

/**
 * Is this tier on sale right now?
 *
 * Both bounds null means "on sale while the event is published", which is how
 * every tier behaved before windows existed — so an organiser who sets
 * neither sees no change.
 *
 * The reason is returned rather than a bare boolean because "not yet" and "no
 * longer" need different words in front of a buyer: one is an invitation to
 * come back, the other is not.
 */
export function salesState(
  tier: SalesWindow,
  now = new Date(),
): { open: true } | { open: false; reason: "not_yet" | "closed"; at: Date } {
  if (tier.salesStartAt && now < tier.salesStartAt) {
    return { open: false, reason: "not_yet", at: tier.salesStartAt };
  }
  if (tier.salesEndAt && now >= tier.salesEndAt) {
    return { open: false, reason: "closed", at: tier.salesEndAt };
  }
  return { open: true };
}

/**
 * A window is only meaningful if it opens before it closes.
 *
 * Checked when an organiser saves a tier rather than when a buyer hits it: an
 * inverted window silently takes the tier off sale forever, and finding that
 * out from an empty sales report is far worse than a validation error.
 */
export function salesWindowOk(tier: SalesWindow): boolean {
  if (!tier.salesStartAt || !tier.salesEndAt) return true;
  return tier.salesStartAt < tier.salesEndAt;
}

// ─── Per-buyer limit ─────────────────────────────────────────────────────

/**
 * May this buyer take `wanted` more tickets for this event?
 *
 * The per-order cap (MAX_QTY_PER_TIER) limits ONE request. This limits a
 * person across every order they place, which is the only version that holds:
 * one email could otherwise place three 8-seat orders and take 24 seats of a
 * high-demand show. Verified against the running app before this existed.
 *
 * `limit` of 0 means unlimited, for an event where hoarding is not a concern.
 */
export function checkBuyerLimit(
  alreadyHeld: number,
  wanted: number,
  limit: number,
): { ok: boolean; reason?: string } {
  if (limit <= 0) return { ok: true };
  if (alreadyHeld >= limit) {
    return { ok: false, reason: `You already hold the maximum of ${limit} ticket(s) for this event` };
  }
  if (alreadyHeld + wanted > limit) {
    return {
      ok: false,
      reason: `This event is limited to ${limit} ticket(s) per buyer — you already hold ${alreadyHeld}`,
    };
  }
  return { ok: true };
}
