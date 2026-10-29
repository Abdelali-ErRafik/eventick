import { describe, expect, it } from "vitest";
import {
  checkBuyerLimit,
  checkQuantity,
  isHoldExpired,
  salesState,
  salesWindowOk,
  seatFor,
  tierRemaining,
} from "../inventory.js";

describe("tierRemaining", () => {
  it("subtracts committed from capacity", () => {
    expect(tierRemaining(100, 40)).toBe(60);
  });
  it("never goes negative", () => {
    expect(tierRemaining(10, 25)).toBe(0);
  });
});

describe("checkQuantity", () => {
  it("rejects zero or negative", () => {
    expect(checkQuantity(0, 10).ok).toBe(false);
  });
  it("rejects above the per-tier max", () => {
    expect(checkQuantity(9, 100).ok).toBe(false);
  });
  it("rejects more than remaining stock", () => {
    expect(checkQuantity(5, 3).ok).toBe(false);
  });
  it("accepts a valid quantity", () => {
    expect(checkQuantity(4, 10).ok).toBe(true);
  });
});

describe("isHoldExpired", () => {
  it("is false for a null hold", () => {
    expect(isHoldExpired(null)).toBe(false);
  });
  it("is true once past the hold time", () => {
    const past = new Date(Date.now() - 1000);
    expect(isHoldExpired(past)).toBe(true);
  });
  it("is false before the hold time", () => {
    const future = new Date(Date.now() + 1000);
    expect(isHoldExpired(future)).toBe(false);
  });
});

describe("seatFor", () => {
  it("assigns row 1 seats 1-12", () => {
    expect(seatFor(1)).toEqual({ row: 1, seat: 1 });
    expect(seatFor(12)).toEqual({ row: 1, seat: 12 });
  });
  it("rolls into row 2 at cursor 13", () => {
    expect(seatFor(13)).toEqual({ row: 2, seat: 1 });
  });

  it("honours a tier's own row width", () => {
    // A 20-wide room: row 1 runs to 20, row 2 starts at 21.
    expect(seatFor(20, 20)).toEqual({ row: 1, seat: 20 });
    expect(seatFor(21, 20)).toEqual({ row: 2, seat: 1 });
    // A narrow 4-wide block.
    expect(seatFor(5, 4)).toEqual({ row: 2, seat: 1 });
  });

  it("falls back to 12 when the width is nonsense", () => {
    // Guards against a 0 or negative slipping in and producing Infinity rows.
    expect(seatFor(13, 0)).toEqual({ row: 2, seat: 1 });
    expect(seatFor(13, -5)).toEqual({ row: 2, seat: 1 });
  });
});

describe("salesState", () => {
  const T = (s: string | null, e: string | null) => ({
    salesStartAt: s ? new Date(s) : null,
    salesEndAt: e ? new Date(e) : null,
  });
  const now = new Date("2026-06-15T12:00:00Z");

  it("is open when no window is set", () => {
    // How every tier behaved before windows existed — an organiser who sets
    // neither must see no change.
    expect(salesState(T(null, null), now)).toEqual({ open: true });
  });

  it("is open inside the window", () => {
    expect(salesState(T("2026-06-01", "2026-07-01"), now)).toEqual({ open: true });
  });

  it("reports not_yet before it opens", () => {
    const state = salesState(T("2026-07-01", null), now);
    expect(state.open).toBe(false);
    // "not yet" invites the buyer back; "closed" does not. The distinction is
    // the reason this returns a reason rather than a boolean.
    if (!state.open) expect(state.reason).toBe("not_yet");
  });

  it("reports closed once it ends", () => {
    const state = salesState(T(null, "2026-06-01"), now);
    expect(state.open).toBe(false);
    if (!state.open) expect(state.reason).toBe("closed");
  });

  it("treats the end as exclusive", () => {
    // Sales "until midnight" must not still be open at midnight.
    const boundary = new Date("2026-07-01T00:00:00Z");
    expect(salesState(T(null, "2026-07-01T00:00:00Z"), boundary).open).toBe(false);
  });

  it("treats the start as inclusive", () => {
    const boundary = new Date("2026-07-01T00:00:00Z");
    expect(salesState(T("2026-07-01T00:00:00Z", null), boundary).open).toBe(true);
  });

  it("honours a start-only or end-only window", () => {
    expect(salesState(T("2026-06-01", null), now).open).toBe(true);
    expect(salesState(T(null, "2026-07-01"), now).open).toBe(true);
  });
});

describe("salesWindowOk", () => {
  it("accepts a window that opens before it closes", () => {
    expect(salesWindowOk({ salesStartAt: new Date("2026-06-01"), salesEndAt: new Date("2026-07-01") })).toBe(true);
  });

  it("accepts a half-open window", () => {
    expect(salesWindowOk({ salesStartAt: new Date("2026-06-01"), salesEndAt: null })).toBe(true);
    expect(salesWindowOk({ salesStartAt: null, salesEndAt: new Date("2026-07-01") })).toBe(true);
  });

  it("rejects an inverted window", () => {
    // Caught when the organiser saves, not when a buyer hits it: an inverted
    // window takes the tier off sale forever, and learning that from an empty
    // sales report is far worse than a validation error.
    expect(salesWindowOk({ salesStartAt: new Date("2026-07-01"), salesEndAt: new Date("2026-06-01") })).toBe(false);
  });

  it("rejects a zero-length window", () => {
    const t = new Date("2026-06-01");
    expect(salesWindowOk({ salesStartAt: t, salesEndAt: t })).toBe(false);
  });
});

describe("checkBuyerLimit", () => {
  it("allows a first purchase inside the limit", () => {
    expect(checkBuyerLimit(0, 4, 10)).toEqual({ ok: true });
  });

  it("allows a purchase that exactly reaches the limit", () => {
    expect(checkBuyerLimit(6, 4, 10)).toEqual({ ok: true });
  });

  it("refuses the order that would cross the limit", () => {
    // THE case this exists for: the per-order cap is 8, so without this one
    // email could place three orders and take 24 seats of a high-demand show.
    const result = checkBuyerLimit(8, 8, 10);
    expect(result.ok).toBe(false);
    // The message names what they already hold, because "limited to 10" alone
    // reads as a bug to someone who thinks they have none.
    expect(result.reason).toContain("already hold 8");
  });

  it("refuses outright once the limit is reached", () => {
    const result = checkBuyerLimit(10, 1, 10);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("maximum");
  });

  it("treats 0 as unlimited", () => {
    expect(checkBuyerLimit(500, 500, 0)).toEqual({ ok: true });
  });

  it("treats a negative limit as unlimited rather than locking everyone out", () => {
    expect(checkBuyerLimit(1, 1, -5)).toEqual({ ok: true });
  });
});
