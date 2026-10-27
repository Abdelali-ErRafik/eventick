import Stripe from "stripe";
import { logger } from "./logger.js";

/**
 * Stripe client, or null in MOCK mode.
 *
 * With no STRIPE_SECRET_KEY the app runs end to end without a gateway: a hold
 * is confirmed straight to PAID by the mock path in routes/orders.ts. That
 * keeps the whole funnel demoable offline, but it marks orders paid without
 * charging anything — so production refuses to boot in mock mode (see
 * assertPaymentConfig below), rather than silently giving away tickets.
 */

let client: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    logger.warn("STRIPE_SECRET_KEY unset — payments run in MOCK mode (no card is charged)");
    client = null;
    return client;
  }
  client = new Stripe(key, { apiVersion: "2026-09-30.endive" });
  return client;
}

export function isMockPayments(): boolean {
  return !process.env.STRIPE_SECRET_KEY;
}

/** Called at boot: mock payments must never run on a production host. */
export function assertPaymentConfig(): void {
  if (process.env.NODE_ENV === "production" && isMockPayments()) {
    throw new Error("STRIPE_SECRET_KEY is required in production — refusing to start in mock payment mode");
  }
}

/** Currency for all charges. Prices are stored in MAD cents. */
export const CURRENCY = process.env.STRIPE_CURRENCY ?? "mad";
