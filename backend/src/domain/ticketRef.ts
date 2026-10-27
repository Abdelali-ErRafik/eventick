import { randomInt } from "node:crypto";

/**
 * Ticket reference: `ET-<year>-<10 base32 chars>`.
 *
 * Keeps the original `ET-YYYY-...` shape, but the suffix is CSPRNG-drawn from
 * a ~1e15 keyspace instead of `Math.random()` over 900k. The old version was
 * both guessable — a short, non-cryptographic range on an endpoint anyone with
 * an organiser account can hammer — and prone to collisions on the @unique
 * column, which surfaced as a 500 during a busy sale.
 *
 * Crockford base32 minus I/L/O/U: no character pairs a human can confuse when
 * reading a ref off a screen to a colleague, and no accidental words.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SUFFIX_LENGTH = 10;

export function makeTicketRef(year: number): string {
  let suffix = "";
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `ET-${year}-${suffix}`;
}
