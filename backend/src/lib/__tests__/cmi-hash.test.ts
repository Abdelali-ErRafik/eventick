import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildHash, buildPaymentRequest, isApproved, verifyCallbackHash } from "../cmi.js";

/**
 * CMI's "ver3" hash.
 *
 * This is the whole security model of the integration, in both directions: the
 * request hash stops a buyer editing the amount in the form, and the callback
 * hash is the ONLY thing distinguishing a real "payment approved" from a forged
 * POST to a public, unauthenticated endpoint. A silent bug here either breaks
 * every payment (CMI rejects our hash) or accepts forged ones — so the
 * algorithm is pinned against hand-built plaintext rather than a snapshot of
 * whatever the code happens to produce.
 */

const STORE_KEY = "M1234567";
const CONFIG = { clientId: "600001388", storeKey: STORE_KEY, gatewayUrl: "https://testpayment.cmi.co.ma/fim/est3Dgate" };

describe("buildHash", () => {
  it("hashes values joined by pipes, in case-insensitive field order, with the store key appended", () => {
    // Field names sort A, b, c ignoring case, so the plaintext is built from
    // their values in that order. Spelled out by hand: if the sort or the join
    // changed, this expectation would not move with it.
    const expected = createHash("sha512").update(`one|two|three|${STORE_KEY}`, "utf8").digest("base64");
    expect(buildHash({ b: "two", A: "one", c: "three" }, STORE_KEY)).toBe(expected);
  });

  it("returns base64 of the raw 64-byte digest, not of its hex string", () => {
    // CMI's reference does base64_encode(pack('H*', hash(...))). Hashing the
    // hex text instead yields a 172-char string and CMI rejects every payment.
    expect(buildHash({ a: "x" }, STORE_KEY)).toHaveLength(88);
  });

  it("excludes hash and encoding, whatever their case", () => {
    const base = { amount: "850.00", clientid: "600001388" };
    const withExtras = { ...base, hash: "whatever", HASH: "whatever", encoding: "UTF-8" };
    expect(buildHash(withExtras, STORE_KEY)).toBe(buildHash(base, STORE_KEY));
  });

  it("escapes pipes so field boundaries stay unambiguous", () => {
    // Unescaped, both of these produce the plaintext "x|y|z|" + key — two
    // different payloads with one signature, which is a forgery primitive.
    expect(buildHash({ a: "x|y", b: "z" }, STORE_KEY)).not.toBe(buildHash({ a: "x", b: "y|z" }, STORE_KEY));
  });

  it("escapes backslashes before pipes, not after", () => {
    // Escaping in the wrong order would re-escape the backslash just inserted,
    // turning "a|b" into "a\\|b" instead of "a\|b".
    const value = "a\\|b";
    const expected = createHash("sha512").update(`a\\\\\\|b|${STORE_KEY}`, "utf8").digest("base64");
    expect(buildHash({ a: value }, STORE_KEY)).toBe(expected);
  });

  it("trims values, matching CMI's own normalisation", () => {
    expect(buildHash({ a: " x " }, STORE_KEY)).toBe(buildHash({ a: "x" }, STORE_KEY));
  });
});

describe("buildPaymentRequest", () => {
  const input = {
    reference: "EVT-abc123",
    totalCents: 85000,
    email: "buyer@example.ma",
    holderName: "Test Buyer",
    phone: "0600000000",
    callbackUrl: "https://eventick.ma/api/webhooks/cmi",
    okUrl: "https://eventick.ma/confirmation/abc123",
    failUrl: "https://eventick.ma/paiement?echec=1",
  };

  it("sends the amount in MAD units with two decimals, not in cents", () => {
    // 85000 cents is 850.00 MAD. Posting "85000" would charge 100x the price.
    expect(buildPaymentRequest(input, CONFIG).fields.amount).toBe("850.00");
  });

  it("captures the funds rather than only reserving them", () => {
    // preAuth would leave every ticket sale awaiting a manual capture, so the
    // buyer is debited but the organiser never paid.
    expect(buildPaymentRequest(input, CONFIG).fields.TranType).toBe("Auth");
  });

  it("declares MAD and the ver3 hash algorithm", () => {
    const { fields } = buildPaymentRequest(input, CONFIG);
    expect(fields.currency).toBe("504");
    expect(fields.hashAlgorithm).toBe("ver3");
    expect(fields.storetype).toBe("3d_pay_hosting");
  });

  it("signs the fields it posts, so the form cannot be edited in the browser", () => {
    const { fields } = buildPaymentRequest(input, CONFIG);
    const { hash, encoding, ...signed } = fields;
    expect(encoding).toBe("UTF-8");
    expect(hash).toBe(buildHash(signed, STORE_KEY));
  });

  it("produces a hash that no longer matches once the amount is tampered with", () => {
    const { fields } = buildPaymentRequest(input, CONFIG);
    // What a buyer editing the form in dev tools would send.
    const tampered: Record<string, string> = { ...fields, amount: "1.00" };
    const { hash, encoding, ...signed } = tampered;
    expect(hash).not.toBe(buildHash(signed, STORE_KEY));
  });

  it("uses a fresh nonce per attempt so two tries on one order sign differently", () => {
    const first = buildPaymentRequest(input, CONFIG).fields;
    const second = buildPaymentRequest(input, CONFIG).fields;
    expect(first.rnd).not.toBe(second.rnd);
    expect(first.hash).not.toBe(second.hash);
  });

  it("falls back to the French page for Arabic, which CMI does not serve", () => {
    expect(buildPaymentRequest({ ...input, locale: "ar" }, CONFIG).fields.lang).toBe("fr");
    expect(buildPaymentRequest({ ...input, locale: "en" }, CONFIG).fields.lang).toBe("en");
  });

  it("tolerates a missing phone without putting 'undefined' in the hash", () => {
    const { fields } = buildPaymentRequest({ ...input, phone: null }, CONFIG);
    expect(fields.tel).toBe("");
  });
});

describe("verifyCallbackHash", () => {
  /** A callback shaped like CMI's, signed with the store key. */
  function signedCallback(overrides: Record<string, string> = {}) {
    const body: Record<string, string> = {
      clientid: "600001388",
      oid: "EVT-abc123",
      ProcReturnCode: "00",
      Response: "Approved",
      TransId: "24300xyz",
      amount: "850.00",
      ...overrides,
    };
    return { ...body, HASH: buildHash(body, STORE_KEY) };
  }

  it("accepts a correctly signed callback", () => {
    expect(verifyCallbackHash(signedCallback(), STORE_KEY)).toBe(true);
  });

  it("rejects a callback with no hash at all", () => {
    // The forgery that matters most: a bare POST of ProcReturnCode=00 to a
    // public endpoint. Without this check it would issue free tickets.
    expect(verifyCallbackHash({ oid: "EVT-abc123", ProcReturnCode: "00" }, STORE_KEY)).toBe(false);
  });

  it("rejects a callback whose amount was altered after signing", () => {
    const body = signedCallback();
    expect(verifyCallbackHash({ ...body, amount: "1.00" }, STORE_KEY)).toBe(false);
  });

  it("rejects a callback whose result code was flipped to approved", () => {
    const declined = signedCallback({ ProcReturnCode: "99", Response: "Declined" });
    expect(verifyCallbackHash({ ...declined, ProcReturnCode: "00" }, STORE_KEY)).toBe(false);
  });

  it("rejects a callback pointed at a different order", () => {
    const body = signedCallback();
    expect(verifyCallbackHash({ ...body, oid: "EVT-someone-else" }, STORE_KEY)).toBe(false);
  });

  it("rejects a callback signed with the wrong store key", () => {
    expect(verifyCallbackHash(signedCallback(), "WRONG-KEY")).toBe(false);
  });

  it("rejects an extra field smuggled in after signing", () => {
    // Every posted field participates in the hash, so an added one breaks it.
    const body = signedCallback();
    expect(verifyCallbackHash({ ...body, injected: "x" }, STORE_KEY)).toBe(false);
  });

  it("accepts a lowercase hash field, which CMI also sends", () => {
    const body = signedCallback();
    const { HASH, ...rest } = body;
    expect(verifyCallbackHash({ ...rest, hash: HASH }, STORE_KEY)).toBe(true);
  });
});

describe("isApproved", () => {
  it("treats only 00 as approved", () => {
    expect(isApproved({ ProcReturnCode: "00" })).toBe(true);
    expect(isApproved({ ProcReturnCode: "99" })).toBe(false);
    expect(isApproved({ ProcReturnCode: "" })).toBe(false);
    expect(isApproved({})).toBe(false);
  });
});
