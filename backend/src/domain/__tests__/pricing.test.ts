import { describe, expect, it } from "vitest";
import { quotePromo, type PromoCandidate } from "../pricing.js";

const SAFRAN15: PromoCandidate = {
  id: "p1",
  code: "SAFRAN15",
  kind: "PERCENT",
  value: 15,
  eventId: null,
  maxUses: 200,
  uses: 12,
};

const CASA50: PromoCandidate = {
  id: "p2",
  code: "CASA50",
  kind: "AMOUNT",
  value: 5000,
  eventId: "oasis-2026",
  maxUses: 40,
  uses: 3,
};

describe("quotePromo", () => {
  it("applies a sitewide percent code", () => {
    const result = quotePromo([SAFRAN15], "safran15", "any-event", 10000);
    expect(result?.discountCents).toBe(1500);
  });

  it("is case-insensitive", () => {
    expect(quotePromo([SAFRAN15], "SaFrAn15", "any-event", 10000)?.discountCents).toBe(1500);
  });

  it("rejects an event-scoped code on the wrong event", () => {
    expect(quotePromo([CASA50], "CASA50", "mawazine-2027", 10000)).toBeNull();
  });

  it("accepts an event-scoped code on its own event", () => {
    expect(quotePromo([CASA50], "CASA50", "oasis-2026", 10000)?.discountCents).toBe(5000);
  });

  it("clamps the discount to the subtotal", () => {
    expect(quotePromo([CASA50], "CASA50", "oasis-2026", 2000)?.discountCents).toBe(2000);
  });

  it("rejects a code at its usage cap", () => {
    const exhausted = { ...SAFRAN15, uses: 200 };
    expect(quotePromo([exhausted], "SAFRAN15", "any-event", 10000)).toBeNull();
  });

  it("rejects an unknown code", () => {
    expect(quotePromo([SAFRAN15], "NOPE", "any-event", 10000)).toBeNull();
  });
});
