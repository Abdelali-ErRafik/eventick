import { createHash, timingSafeEqual } from "node:crypto";
import { logger } from "./logger.js";

/**
 * CMI (Centre Monétique Interbancaire) — the payment gateway.
 *
 * CMI is a REDIRECT gateway, not an in-page SDK: we hand the browser a signed
 * form, it POSTs to CMI's hosted 3-D Secure page, the buyer types their card
 * there, and CMI reports the outcome to us server-to-server. So, unlike the
 * Stripe integration this replaces, no card data ever reaches this server AND
 * there is no client secret to hand the browser — only a signed form.
 *
 * Two things make a payment trustworthy here, and both are hash-based:
 *
 *  1. The REQUEST hash proves to CMI that the amount and order reference were
 *     set by us, so a buyer cannot edit the form and pay 1 MAD for a 850 MAD
 *     ticket.
 *  2. The CALLBACK hash proves to us that the "payment approved" message
 *     really came from CMI. The callback endpoint is necessarily public and
 *     unauthenticated, so without this check anyone who guessed an order id
 *     could POST `ProcReturnCode=00` and be issued free tickets. Several CMI
 *     integrations in the wild skip this; it is the whole security model.
 *
 * With no CMI_CLIENT_ID/CMI_STORE_KEY the app runs in MOCK mode: a hold is
 * confirmed straight to PAID without a gateway, which keeps the funnel
 * demoable offline. Production refuses to boot that way (assertPaymentConfig).
 */

/** CMI settles in MAD only; 504 is its numeric currency code. */
export const CMI_CURRENCY = "504";

/** CMI's own name for a direct sale (funds captured now, not just reserved). */
const TRAN_TYPE = "Auth";

export interface CmiConfig {
  clientId: string;
  storeKey: string;
  gatewayUrl: string;
}

export function cmiConfig(): CmiConfig | null {
  const clientId = process.env.CMI_CLIENT_ID;
  const storeKey = process.env.CMI_STORE_KEY;
  if (!clientId || !storeKey) return null;
  return {
    clientId,
    storeKey,
    gatewayUrl: process.env.CMI_GATEWAY_URL ?? "https://testpayment.cmi.co.ma/fim/est3Dgate",
  };
}

let warned = false;

export function isMockPayments(): boolean {
  const configured = cmiConfig() !== null;
  if (!configured && !warned) {
    warned = true;
    logger.warn("CMI_CLIENT_ID/CMI_STORE_KEY unset — payments run in MOCK mode (no card is charged)");
  }
  return !configured;
}

/** Called at boot: mock payments must never run on a production host. */
export function assertPaymentConfig(): void {
  if (process.env.NODE_ENV === "production" && isMockPayments()) {
    throw new Error(
      "CMI_CLIENT_ID and CMI_STORE_KEY are required in production — refusing to start in mock payment mode",
    );
  }
}

/**
 * Escape one value for the hash string.
 *
 * Backslash FIRST, then pipe — the other order would re-escape the backslash
 * this step just inserted. Without this, a buyer whose name contained a "|"
 * could shift the field boundaries and make two different payloads hash the
 * same, which is exactly the ambiguity the escaping exists to remove.
 */
function escapeHashValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|");
}

/** Fields CMI excludes from its own hash, so we must exclude them too. */
function excludedFromHash(key: string): boolean {
  const lower = key.toLowerCase();
  return lower === "hash" || lower === "encoding";
}

/**
 * CMI's "ver3" hash: field names sorted case-insensitively, their values
 * escaped and joined with "|", the store key appended, then SHA-512 — and the
 * RAW digest bytes base64-encoded, not the hex string.
 */
export function buildHash(params: Record<string, unknown>, storeKey: string): string {
  const names = Object.keys(params)
    .filter((key) => !excludedFromHash(key))
    // Case-insensitive, numeric-aware: CMI's reference uses PHP's natcasesort.
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  let plain = "";
  for (const name of names) plain += `${escapeHashValue(params[name])}|`;
  plain += escapeHashValue(storeKey);

  return createHash("sha512").update(plain, "utf8").digest("base64");
}

/**
 * Recompute the hash over everything CMI posted back and compare it to the
 * HASH field it sent. Returns false on any mismatch, including a missing hash.
 *
 * Every posted field participates, not a fixed list: CMI decides what it sends
 * and signs all of it, so hashing only the fields we know about would fail as
 * soon as CMI added one.
 */
export function verifyCallbackHash(body: Record<string, unknown>, storeKey: string): boolean {
  const presented = typeof body.HASH === "string" ? body.HASH : typeof body.hash === "string" ? body.hash : null;
  if (!presented) return false;

  const expected = buildHash(body, storeKey);

  // Timing-safe: a plain === leaks how much of the hash matched, which is
  // enough to forge one byte at a time given sufficient attempts.
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface CmiPaymentRequest {
  /** Where the browser must POST the fields. */
  action: string;
  /** Hidden form fields, hash included. */
  fields: Record<string, string>;
  /** The reference CMI will echo back as `oid`. */
  oid: string;
}

export interface CmiOrderInput {
  /** Becomes CMI's `oid`; what the callback uses to find the order again. */
  reference: string;
  totalCents: number;
  email: string;
  holderName: string;
  phone?: string | null;
  /** Where CMI POSTs the outcome, server-to-server. */
  callbackUrl: string;
  /** Where the buyer's browser lands afterwards. */
  okUrl: string;
  failUrl: string;
  locale?: "fr" | "en" | "ar";
}

/**
 * Build the signed form that sends a buyer to CMI.
 *
 * `amount` goes out in MAD units with two decimals, not cents — CMI expects
 * "850.00", and sending 85000 would charge a hundred times the ticket price.
 */
export function buildPaymentRequest(input: CmiOrderInput, config: CmiConfig): CmiPaymentRequest {
  const fields: Record<string, string> = {
    clientid: config.clientId,
    oid: input.reference,
    amount: (input.totalCents / 100).toFixed(2),
    currency: CMI_CURRENCY,
    // Per-request nonce. CMI rejects a replayed (oid, rnd) pair, and it also
    // lands in the hash, so two attempts on the same order sign differently.
    rnd: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
    TranType: TRAN_TYPE,
    storetype: "3d_pay_hosting",
    hashAlgorithm: "ver3",
    // CMI only speaks these three; Arabic buyers get the French page.
    lang: input.locale === "en" ? "en" : "fr",
    refreshtime: "5",
    callbackUrl: input.callbackUrl,
    okUrl: input.okUrl,
    failUrl: input.failUrl,
    BillToName: input.holderName.trim(),
    email: input.email.trim(),
    tel: input.phone?.trim() ?? "",
  };

  // Hash covers every field above; `hash` and `encoding` are added after and
  // are excluded by buildHash itself.
  fields.hash = buildHash(fields, config.storeKey);
  fields.encoding = "UTF-8";

  return { action: config.gatewayUrl, fields, oid: input.reference };
}

/** CMI's "approved" response code. Anything else is a decline or an error. */
export function isApproved(body: Record<string, unknown>): boolean {
  return String(body.ProcReturnCode ?? "") === "00";
}

/**
 * Where CMI sends the buyer and the result.
 *
 * All three must be absolute and reachable from outside: CMI redirects a real
 * browser to okUrl/failUrl and calls callbackUrl from its own servers, so a
 * localhost callback never arrives. Use a tunnel (CMI_CALLBACK_URL) to test
 * the callback locally.
 */
export function cmiUrls(orderId: string, accessToken?: string | null) {
  const app = (process.env.PUBLIC_APP_URL ?? "http://localhost:3100").replace(/\/+$/, "");
  const api = (process.env.PUBLIC_API_URL ?? "http://localhost:4100").replace(/\/+$/, "");
  // The access token rides along so a guest buyer lands on a confirmation
  // page they are authorised to read, exactly as the emailed link does.
  const key = accessToken ? `?k=${encodeURIComponent(accessToken)}` : "";
  return {
    callbackUrl: process.env.CMI_CALLBACK_URL ?? `${api}/api/webhooks/cmi`,
    okUrl: `${app}/confirmation/${orderId}${key}`,
    failUrl: `${app}/paiement?echec=1&commande=${encodeURIComponent(orderId)}`,
  };
}
