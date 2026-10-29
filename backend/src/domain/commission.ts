/**
 * Platform commission — what Eventick keeps from a ticket sale.
 *
 * Pure arithmetic, no Prisma, so the rounding rules are testable on their own.
 * The figures these produce are money owed by a real organiser, so two
 * properties matter more than brevity:
 *
 *  - Rates are BASIS POINTS (500 = 5%), never floats. A 5% rate as 0.05 makes
 *    `gross * rate` a float multiplication whose error compounds across a
 *    month of orders — the exact drift that storing money as integer cents
 *    exists to prevent.
 *  - The fee on a REFUND follows the money back. Charging commission on a
 *    ticket the buyer was refunded for means the organiser pays to make a sale
 *    that no longer exists.
 */

/** A plan's charging terms. Mirrors the Plan model, minus the labels. */
export interface PlanTerms {
  key: string;
  rateBps: number;
  monthlyCents: number;
}

/** Basis points in 100%. */
const BPS_DIVISOR = 10_000;

/**
 * Commission on one order's gross.
 *
 * Rounded half-up to the cent, once, at the end — not per ticket. Rounding
 * each ticket and summing would charge a different total for the same basket
 * depending on how it was split across orders.
 */
export function feeForOrder(grossCents: number, plan: PlanTerms): number {
  if (grossCents <= 0) return 0;
  return Math.round((grossCents * plan.rateBps) / BPS_DIVISOR);
}

/**
 * The fee still owed on an order after refunds.
 *
 * Proportional to what the buyer actually kept: refund half an order and half
 * the commission goes with it. Returns 0 rather than a negative number if
 * more was refunded than charged, which a correction can produce.
 */
export function feeAfterRefund(
  grossCents: number,
  refundedCents: number,
  feeCents: number,
): number {
  if (feeCents <= 0 || grossCents <= 0) return 0;
  const kept = grossCents - refundedCents;
  if (kept <= 0) return 0;
  if (kept >= grossCents) return feeCents;
  return Math.round((feeCents * kept) / grossCents);
}

export interface RevenueLine {
  totalCents: number;
  refundedCents: number;
  /** Null for orders settled before commission was recorded. */
  feeCents: number | null;
}

export interface RevenueSummary {
  /** Ticket revenue the buyers actually kept — gross minus refunds. */
  netRevenueCents: number;
  /** Commission on that kept revenue. */
  feeCents: number;
  /** What the organiser is owed: netRevenue - fee. */
  payableCents: number;
  /** Money returned to buyers, for display alongside the above. */
  refundedCents: number;
  /** Gross before refunds, so the two can be shown side by side. */
  grossCents: number;
}

/**
 * Roll a set of settled orders into the four figures the Finance screen shows.
 *
 * Deliberately takes rows rather than querying: the caller decides scope
 * (one organiser, one period, the whole platform) and this stays arithmetic.
 *
 * `fallbackPlan` prices orders that carry no recorded fee — the ones settled
 * before commission existed. Without it their revenue would appear to cost
 * nothing, overstating what is payable.
 */
export function summariseRevenue(lines: RevenueLine[], fallbackPlan?: PlanTerms): RevenueSummary {
  let gross = 0;
  let refunded = 0;
  let fee = 0;

  for (const line of lines) {
    gross += line.totalCents;
    refunded += line.refundedCents;

    const recorded = line.feeCents ?? (fallbackPlan ? feeForOrder(line.totalCents, fallbackPlan) : 0);
    fee += feeAfterRefund(line.totalCents, line.refundedCents, recorded);
  }

  const netRevenue = gross - refunded;
  return {
    grossCents: gross,
    refundedCents: refunded,
    netRevenueCents: netRevenue,
    feeCents: fee,
    // A fully refunded month leaves netRevenue at 0 and nothing payable;
    // clamping stops a rounding artefact showing as money owed.
    payableCents: Math.max(0, netRevenue - fee),
  };
}

/** First instant of the UTC calendar month containing `date`. */
export function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/**
 * Every calendar month a half-open period [start, end) touches.
 *
 * Used to bill a plan's fixed monthly fee from a payout: a run covering March
 * and April owes two months, and one covering a single afternoon owes one.
 *
 * Half-open is what makes this safe to use for consecutive runs — a period
 * ending exactly at a month boundary does NOT include that month, so
 * [Mar 1, Apr 1) and [Apr 1, May 1) bill March and April once each rather
 * than billing April twice.
 */
export function monthsInPeriod(start: Date, end: Date): Date[] {
  if (end <= start) return [];
  const months: Date[] = [];
  const cursor = monthStart(start);
  while (cursor < end) {
    months.push(new Date(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

/** Moroccan RIB: exactly 24 digits. */
export function ribOk(value: string): boolean {
  return /^\d{24}$/.test(value.replace(/[\s-]/g, ""));
}

/** Strip the spacing people paste in, so stored RIBs compare equal. */
export function normaliseRib(value: string): string {
  return value.replace(/[\s-]/g, "");
}
