import { describe, expect, it } from "vitest";
import { betterPlanAt, monthlyCostOn, type PlanTerms } from "../commission.js";

/*
 * The real tiers. Hardcoded rather than read from the database: this is the
 * arithmetic of the pricing, and a test that passes because someone edited a
 * plan row would be testing nothing.
 */
const STARTER: PlanTerms = { key: "starter", rateBps: 500, monthlyCents: 0 };
const PRO: PlanTerms = { key: "pro", rateBps: 300, monthlyCents: 49_900 };
const BUSINESS: PlanTerms = { key: "business", rateBps: 200, monthlyCents: 199_900 };
const ALL = [STARTER, PRO, BUSINESS];

const mad = (dirhams: number) => dirhams * 100;

describe("monthlyCostOn", () => {
  it("is the commission plus the fixed fee", () => {
    // 30 000 at 3% = 900, plus 499 = 1 399.
    expect(monthlyCostOn(mad(30_000), PRO)).toBe(mad(1_399));
  });

  it("is just the fee when nothing sold", () => {
    expect(monthlyCostOn(0, PRO)).toBe(mad(499));
    expect(monthlyCostOn(0, STARTER)).toBe(0);
  });

  it("never returns a negative cost", () => {
    expect(monthlyCostOn(-1, STARTER)).toBe(0);
  });
});

describe("betterPlanAt", () => {
  it("leaves a quiet month on Starter", () => {
    // 5 000 at 5% = 250. Pro would be 150 + 499 = 649 — worse.
    expect(betterPlanAt(mad(5_000), STARTER, ALL)).toBeNull();
  });

  it("leaves a new organiser alone entirely", () => {
    expect(betterPlanAt(0, STARTER, ALL)).toBeNull();
  });

  it("says nothing about a month with no sales, whatever the plan", () => {
    // Arithmetically a Business organiser who sold nothing "saves" the whole
    // 1 999 by dropping to Starter. Telling someone that in the month they
    // are still setting up is advice without evidence, and it would fire for
    // every new organiser on a paid plan.
    expect(betterPlanAt(0, BUSINESS, ALL)).toBeNull();
    expect(betterPlanAt(0, PRO, ALL)).toBeNull();
  });

  it("recommends Pro once it actually pays off", () => {
    // 40 000: Starter 2 000, Pro 1 200 + 499 = 1 699. Saves 301.
    const advice = betterPlanAt(mad(40_000), STARTER, ALL);
    expect(advice?.plan.key).toBe("pro");
    expect(advice?.savesCents).toBe(mad(301));
  });

  it("does not nudge just below the break-even", () => {
    // 25 000: Starter 1 250, Pro 750 + 499 = 1 249. Saves 1 MAD — noise.
    expect(betterPlanAt(mad(25_000), STARTER, ALL)).toBeNull();
  });

  it("picks Business over Pro at high volume", () => {
    // 200 000: Starter 10 000, Pro 6 000 + 499 = 6 499,
    //          Business 4 000 + 1 999 = 5 999. Business wins.
    const advice = betterPlanAt(mad(200_000), STARTER, ALL);
    expect(advice?.plan.key).toBe("business");
  });

  it("moves someone from Pro up to Business when that is cheaper", () => {
    const advice = betterPlanAt(mad(200_000), PRO, ALL);
    expect(advice?.plan.key).toBe("business");
    // Pro 6 499 - Business 5 999 = 500.
    expect(advice?.savesCents).toBe(mad(500));
  });

  it("moves someone DOWN when their volume fell", () => {
    // A Business organiser selling 10 000: Business 200 + 1 999 = 2 199,
    // Starter 500. The advice has to work in both directions, or it only
    // ever sells upgrades.
    const advice = betterPlanAt(mad(10_000), BUSINESS, ALL);
    expect(advice?.plan.key).toBe("starter");
    expect(advice?.savesCents).toBe(mad(1_699));
  });

  it("says nothing when the current plan is already best", () => {
    expect(betterPlanAt(mad(40_000), PRO, ALL)).toBeNull();
  });

  it("never recommends the plan already held", () => {
    for (const plan of ALL) {
      for (const volume of [0, mad(1_000), mad(50_000), mad(500_000)]) {
        expect(betterPlanAt(volume, plan, ALL)?.plan.key).not.toBe(plan.key);
      }
    }
  });

  it("ignores a saving too small to act on", () => {
    // One dirham of saving must not produce a prompt.
    const tiny: PlanTerms = { key: "tiny", rateBps: 499, monthlyCents: 0 };
    expect(betterPlanAt(mad(1_000), STARTER, [STARTER, tiny])).toBeNull();
  });

  it("honours a caller's own threshold", () => {
    const tiny: PlanTerms = { key: "tiny", rateBps: 499, monthlyCents: 0 };
    expect(betterPlanAt(mad(1_000), STARTER, [STARTER, tiny], 1)?.plan.key).toBe("tiny");
  });
});
