import { describe, expect, it } from "vitest";
import { resolveSecret } from "../jwt.js";

/**
 * The production JWT secret guard.
 *
 * The original check only asked whether JWT_SECRET was SET, so `JWT_SECRET=x`
 * booted happily — and a one-character secret is recovered offline from a
 * single captured token in moments. Forging the signature means minting a
 * token for any user and any role, so a weak secret in production is the same
 * vulnerability as no secret at all, and gets the same refusal.
 */

const STRONG = "k7Qv2Lm9Xp4Rt8Yw1Zc6Bn3Hs5Jd0Fg2Aq";

describe("resolveSecret in production", () => {
  it("refuses a missing secret", () => {
    expect(() => resolveSecret({ NODE_ENV: "production" })).toThrow(/must be set/i);
  });

  it("refuses a secret that is only whitespace", () => {
    expect(() => resolveSecret({ NODE_ENV: "production", JWT_SECRET: "   " })).toThrow(/must be set/i);
  });

  it("refuses a short secret, which is the case the old check let through", () => {
    expect(() => resolveSecret({ NODE_ENV: "production", JWT_SECRET: "x" })).toThrow(/at least 32/i);
  });

  it("refuses a secret one character under the minimum", () => {
    expect(() => resolveSecret({ NODE_ENV: "production", JWT_SECRET: "a".repeat(31) })).toThrow(/at least 32/i);
  });

  it("refuses the dev fallback, long or not", () => {
    expect(() => resolveSecret({ NODE_ENV: "production", JWT_SECRET: "dev-secret-change-me" })).toThrow(
      /placeholder/i,
    );
  });

  it("refuses known placeholders whatever their case", () => {
    for (const weak of ["changeme", "CHANGEME", "ChangeMe", "secret", "supersecret"]) {
      expect(() => resolveSecret({ NODE_ENV: "production", JWT_SECRET: weak })).toThrow(/placeholder/i);
    }
  });

  it("accepts a real secret", () => {
    expect(resolveSecret({ NODE_ENV: "production", JWT_SECRET: STRONG })).toBe(STRONG);
  });

  it("accepts exactly the minimum length", () => {
    const atMinimum = "b".repeat(32);
    expect(resolveSecret({ NODE_ENV: "production", JWT_SECRET: atMinimum })).toBe(atMinimum);
  });

  it("trims surrounding whitespace rather than counting it toward the length", () => {
    expect(resolveSecret({ NODE_ENV: "production", JWT_SECRET: `  ${STRONG}  ` })).toBe(STRONG);
    // Padding a short secret with spaces must not get it past the check.
    expect(() => resolveSecret({ NODE_ENV: "production", JWT_SECRET: `${"c".repeat(10)}${" ".repeat(40)}` })).toThrow(
      /at least 32/i,
    );
  });
});

describe("resolveSecret outside production", () => {
  it("falls back so a dev machine needs no configuration", () => {
    expect(resolveSecret({ NODE_ENV: "development" })).toBe("dev-secret-change-me");
  });

  it("still prefers a configured secret", () => {
    expect(resolveSecret({ NODE_ENV: "development", JWT_SECRET: STRONG })).toBe(STRONG);
  });

  it("does not block a short secret in development", () => {
    // The strictness is a production rule. Enforcing it locally would only
    // make the dev setup annoying without protecting anything real.
    expect(resolveSecret({ NODE_ENV: "test", JWT_SECRET: "short" })).toBe("short");
  });
});
