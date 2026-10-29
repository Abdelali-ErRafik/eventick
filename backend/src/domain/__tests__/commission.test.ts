import { describe, expect, it } from "vitest";
import {
  feeAfterRefund,
  feeForOrder,
  normaliseRib,
  ribOk,
  summariseRevenue,
  type PlanTerms,
} from "../commission.js";

/**
 * Commission arithmetic.
 *
 * These numbers are money a real organiser owes, so the tests pin the
 * rounding and the refund behaviour rather than just checking the happy path.
 * The Finance screen used to compute all of this in the browser from a plan
 * the organiser picked themselves, and stored none of it.
 */

const STARTER: PlanTerms = { key: "starter", rateBps: 500, monthlyCents: 0 };
const PRO: PlanTerms = { key: "pro", rateBps: 300, monthlyCents: 49900 };

describe("feeForOrder", () => {
  it("takes the plan's percentage of the gross", () => {
    // 850 MAD at 5%.
    expect(feeForOrder(85000, STARTER)).toBe(4250);
    expect(feeForOrder(85000, PRO)).toBe(2550);
  });

  it("rounds to the nearest cent", () => {
    // 3% of 333 cents is 9.99.
    expect(feeForOrder(333, PRO)).toBe(10);
  });

  it("charges nothing on a zero or negative gross", () => {
    // A fully discounted comp ticket owes no commission.
    expect(feeForOrder(0, STARTER)).toBe(0);
    expect(feeForOrder(-100, STARTER)).toBe(0);
  });

  it("uses basis points, so a rate cannot drift across many orders", () => {
    // 1000 orders of 999 cents at 5%: each is 49.95 -> 50. Summing the
    // rounded fee must be exact, which float rates do not guarantee.
    const once = feeForOrder(999, STARTER);
    expect(once).toBe(50);
    expect(once * 1000).toBe(50_000);
  });
});

describe("feeAfterRefund", () => {
  it("keeps the whole fee when nothing was refunded", () => {
    expect(feeAfterRefund(85000, 0, 4250)).toBe(4250);
  });

  it("drops the whole fee when the order was fully refunded", () => {
    // The point of the function: an organiser must not pay commission on a
    // sale the buyer got their money back for.
    expect(feeAfterRefund(85000, 85000, 4250)).toBe(0);
  });

  it("keeps the fee in proportion to what the buyer kept", () => {
    // Half refunded, so half the commission.
    expect(feeAfterRefund(85000, 42500, 4250)).toBe(2125);
  });

  it("never returns a negative fee when more was refunded than charged", () => {
    // Over-refunding is possible through a correction; it must read as zero
    // owed rather than as the platform owing the organiser commission.
    expect(feeAfterRefund(85000, 90000, 4250)).toBe(0);
  });

  it("is zero when no fee was recorded", () => {
    expect(feeAfterRefund(85000, 0, 0)).toBe(0);
  });
});

describe("summariseRevenue", () => {
  it("reports gross, refunds, net, fee and payable", () => {
    const summary = summariseRevenue([
      { totalCents: 85000, refundedCents: 0, feeCents: 4250 },
      { totalCents: 40000, refundedCents: 0, feeCents: 2000 },
    ]);
    expect(summary.grossCents).toBe(125000);
    expect(summary.refundedCents).toBe(0);
    expect(summary.netRevenueCents).toBe(125000);
    expect(summary.feeCents).toBe(6250);
    expect(summary.payableCents).toBe(118750);
  });

  it("subtracts refunds from revenue", () => {
    // The bug this replaces: the Finance screen summed totalCents of PAID
    // orders and ignored refundedCents entirely, so a refunded order still
    // read as revenue AND was charged commission.
    const summary = summariseRevenue([{ totalCents: 85000, refundedCents: 85000, feeCents: 4250 }]);
    expect(summary.netRevenueCents).toBe(0);
    expect(summary.feeCents).toBe(0);
    expect(summary.payableCents).toBe(0);
  });

  it("handles a partial refund on both revenue and fee", () => {
    const summary = summariseRevenue([{ totalCents: 100000, refundedCents: 25000, feeCents: 5000 }]);
    expect(summary.netRevenueCents).toBe(75000);
    expect(summary.feeCents).toBe(3750);
    expect(summary.payableCents).toBe(71250);
  });

  it("prices orders with no recorded fee using the fallback plan", () => {
    // Orders settled before commission existed carry feeCents: null. Treating
    // them as free would overstate what the organiser is owed.
    const summary = summariseRevenue([{ totalCents: 85000, refundedCents: 0, feeCents: null }], STARTER);
    expect(summary.feeCents).toBe(4250);
    expect(summary.payableCents).toBe(80750);
  });

  it("treats an unrecorded fee as zero when there is no fallback", () => {
    const summary = summariseRevenue([{ totalCents: 85000, refundedCents: 0, feeCents: null }]);
    expect(summary.feeCents).toBe(0);
  });

  it("is zero across the board for no orders", () => {
    const summary = summariseRevenue([]);
    expect(summary).toEqual({
      grossCents: 0,
      refundedCents: 0,
      netRevenueCents: 0,
      feeCents: 0,
      payableCents: 0,
    });
  });

  it("never reports negative money payable", () => {
    // An over-refunded month would otherwise show the organiser owing us.
    const summary = summariseRevenue([{ totalCents: 10000, refundedCents: 20000, feeCents: 500 }]);
    expect(summary.payableCents).toBe(0);
  });
});

describe("ribOk", () => {
  it("accepts exactly 24 digits", () => {
    expect(ribOk("123456789012345678901234")).toBe(true);
  });

  it("tolerates the spacing people paste from a bank statement", () => {
    expect(ribOk("1234 5678 9012 3456 7890 1234")).toBe(true);
    expect(ribOk("1234-5678-9012-3456-7890-1234")).toBe(true);
  });

  it("rejects the wrong length or non-digits", () => {
    expect(ribOk("12345")).toBe(false);
    expect(ribOk("1234567890123456789012345")).toBe(false);
    expect(ribOk("12345678901234567890123X")).toBe(false);
    expect(ribOk("")).toBe(false);
  });
});

describe("normaliseRib", () => {
  it("stores digits only, so two spellings of one RIB compare equal", () => {
    expect(normaliseRib("1234 5678 9012 3456 7890 1234")).toBe("123456789012345678901234");
    expect(normaliseRib("1234-5678-9012-3456-7890-1234")).toBe("123456789012345678901234");
  });
});
