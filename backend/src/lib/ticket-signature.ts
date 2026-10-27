import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * QR payload signing.
 *
 * Without this the QR was `EVENTICK|<ref>|<slug>|<name>` in plain text, so
 * anyone could print a ticket that looked right and only the database lookup
 * stood between a forgery and the door. Now the gate verifies the HMAC before
 * touching the database: a forged code is rejected without a query, which also
 * keeps ref-guessing from being a usable probe.
 *
 * The secret is server-only and never ships to a client.
 */

const PREFIX = "EVENTICK";
const SIG_LENGTH = 16;

function secret(): string {
  const configured = process.env.TICKET_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("TICKET_SECRET is required in production — refusing to sign tickets with a default key");
  }
  // Dev fallback keeps the app runnable with no .env; it is NOT a secret.
  return "eventick-dev-ticket-secret";
}

/** Short HMAC over the fields the gate re-derives from its own database. */
export function signTicket(ref: string, eventSlug: string): string {
  return createHmac("sha256", secret()).update(`${ref}|${eventSlug}`).digest("base64url").slice(0, SIG_LENGTH);
}

/** What goes inside the QR image. */
export function ticketPayload(ref: string, eventSlug: string): string {
  return `${PREFIX}|${ref}|${eventSlug}|${signTicket(ref, eventSlug)}`;
}

export interface ParsedPayload {
  ref: string;
  eventSlug: string;
  signature: string;
}

/** Parse a scanned string. Returns null when it isn't one of ours at all. */
export function parsePayload(raw: string): ParsedPayload | null {
  const parts = raw.trim().split("|");
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const [, ref, eventSlug, signature] = parts;
  if (!ref || !eventSlug || !signature) return null;
  return { ref, eventSlug, signature };
}

/** Constant-time compare so a wrong signature can't be found byte by byte. */
export function verifySignature(ref: string, eventSlug: string, signature: string): boolean {
  const expected = Buffer.from(signTicket(ref, eventSlug));
  const given = Buffer.from(signature);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/** How a code reached the gate. This decides whether a signature is required,
 * so it must come from the caller, never be inferred from the code itself. */
export type ScanSource = "camera" | "manual";

export type ScanResult =
  | { ok: true; ref: string; signed: boolean }
  | { ok: false; reason: "malformed" | "unsigned" | "bad-signature" };

/**
 * Resolves a code to a ticket ref, enforcing the signature rule for its source.
 *
 * A camera scan MUST carry a valid signature. Accepting a bare ref here would
 * make the HMAC decorative: refs are printed on every ticket, so anyone who
 * photographs one could encode it in a QR and be admitted. That was the
 * original hole — `signed` was computed and then ignored.
 *
 * A typed ref is allowed without one, because the gate has to keep working
 * when a screen is cracked or too dim to scan. That is a deliberate staff
 * action against a code they can see, not an automatic decision, and the
 * caller records it as such.
 */
export function resolveScan(raw: string, source: ScanSource): ScanResult {
  const parsed = parsePayload(raw);

  if (parsed) {
    if (!verifySignature(parsed.ref, parsed.eventSlug, parsed.signature)) {
      return { ok: false, reason: "bad-signature" };
    }
    return { ok: true, ref: parsed.ref, signed: true };
  }

  const ref = raw.trim().toUpperCase();
  if (ref.length < 3) return { ok: false, reason: "malformed" };
  if (source === "camera") return { ok: false, reason: "unsigned" };
  return { ok: true, ref, signed: false };
}
