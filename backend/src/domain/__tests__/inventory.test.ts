import { describe, expect, it } from "vitest";
import { checkQuantity, isHoldExpired, seatFor, tierRemaining } from "../inventory.js";

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
});
