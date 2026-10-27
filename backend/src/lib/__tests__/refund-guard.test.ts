import { describe, expect, it } from "vitest";

/**
 * The refund guard, as pure logic.
 *
 * The real `refundOrder` needs a database, so this models the
 * compare-and-swap it relies on: a conditional update keyed to the balance
 * the caller read. The bug this covers was a read-then-write where two
 * concurrent refunds both read the same starting balance, both charged
 * Stripe, and the second write silently overwrote the first — paying the
 * buyer twice while the ledger recorded once.
 */
function makeOrder(totalCents: number) {
  let refundedCents = 0;

  return {
    get refunded() {
      return refundedCents;
    },
    /** Mirrors `updateMany({ where: { refundedCents: expected } })`. */
    claim(expected: number, next: number): boolean {
      if (refundedCents !== expected) return false;
      refundedCents = next;
      return true;
    },
    outstanding() {
      return totalCents - refundedCents;
    },
  };
}

describe("refund compare-and-swap", () => {
  it("lets a single refund through", () => {
    const order = makeOrder(70000);
    const read = order.refunded;
    expect(order.claim(read, read + 20000)).toBe(true);
    expect(order.refunded).toBe(20000);
  });

  it("rejects the loser of two concurrent refunds that read the same balance", () => {
    const order = makeOrder(70000);

    // Both callers read before either writes — the interleaving that caused
    // the double refund.
    const readA = order.refunded;
    const readB = order.refunded;

    expect(order.claim(readA, readA + 30000)).toBe(true);
    expect(order.claim(readB, readB + 30000)).toBe(false);

    // Only one refund was recorded, and only one would have reached Stripe.
    expect(order.refunded).toBe(30000);
  });

  it("allows a second refund once the first has settled", () => {
    const order = makeOrder(70000);
    const first = order.refunded;
    expect(order.claim(first, first + 30000)).toBe(true);

    const second = order.refunded;
    expect(order.claim(second, second + 40000)).toBe(true);
    expect(order.refunded).toBe(70000);
    expect(order.outstanding()).toBe(0);
  });

  it("restores the previous balance when the gateway call fails", () => {
    const order = makeOrder(70000);
    const read = order.refunded;
    order.claim(read, read + 25000);

    // Stripe refused — release the claim so the organiser can retry.
    expect(order.claim(read + 25000, read)).toBe(true);
    expect(order.refunded).toBe(0);
    expect(order.outstanding()).toBe(70000);
  });
});
