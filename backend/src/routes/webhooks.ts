import { Router, raw } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/http.js";
import { getStripe } from "../lib/stripe.js";
import { settleOrder } from "../lib/settle.js";
import { completeResale } from "../lib/resale.js";
import { reconcileExternalRefund } from "../lib/refund.js";
import { logger } from "../lib/logger.js";

export const webhooksRouter = Router();

/**
 * Stripe webhook — the ONLY thing that turns a charge into tickets in real
 * mode. The browser's confirmation is not trusted for this: a client can lie,
 * close the tab, or lose its network right after paying.
 *
 * Needs the RAW body (signature is computed over the exact bytes), so this
 * router is mounted before express.json() in app.ts.
 */
webhooksRouter.post(
  "/stripe",
  raw({ type: "application/json" }),
  asyncHandler(async (req, res) => {
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !secret) {
      // Nothing is configured — accept and ignore rather than 500 in mock mode.
      return res.json({ received: true, ignored: "stripe not configured" });
    }

    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") return res.status(400).json({ error: "Missing stripe-signature" });

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, signature, secret);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "stripe webhook signature rejected");
      return res.status(400).json({ error: "Invalid signature" });
    }

    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object;
      const orderId = intent.metadata?.orderId;
      const resaleListingId = intent.metadata?.resaleListingId;

      // A resale buys one existing seat rather than fresh tier inventory, so
      // it settles through completeResale, not settleOrder.
      if (orderId && resaleListingId) {
        await prisma.order.updateMany({
          where: { id: orderId, status: "PENDING" },
          data: { status: "PAID", paymentRef: intent.id },
        });
        await completeResale(resaleListingId, orderId).catch((err) =>
          logger.error({ err, resaleListingId }, "resale completion failed after payment"),
        );
        logger.info({ orderId, resaleListingId }, "resale settled");
      } else if (orderId) {
        const card = intent.payment_method
          ? await stripe.paymentMethods.retrieve(String(intent.payment_method)).catch(() => null)
          : null;
        const result = await settleOrder(orderId, {
          paymentRef: intent.id,
          cardBrand: card?.card?.brand ?? null,
          cardLast4: card?.card?.last4 ?? null,
          cardBank: null,
        });
        logger.info({ orderId, settled: result.settled }, "stripe payment settled");
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object;
      const orderId = intent.metadata?.orderId;
      // Leave the order PENDING so the buyer can retry while the hold lasts;
      // the hold lapsing is what releases the seats.
      if (orderId) logger.info({ orderId }, "stripe payment failed");
    }

    // A refund issued from the Stripe dashboard, or forced by a dispute, never
    // passes through our own refund route. Observing it was not enough: the
    // tickets stayed VALID, so someone who had their money back still got in.
    if (event.type === "charge.refunded" || event.type === "charge.dispute.funds_withdrawn") {
      const charge = event.data.object as { payment_intent?: string | null; amount_refunded?: number; amount?: number };
      const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
      if (intentId) {
        // `amount_refunded` is Stripe's running total for the charge. A
        // dispute withdraws the whole amount and reports no refund total.
        const refunded = charge.amount_refunded ?? charge.amount ?? 0;
        const result = await reconcileExternalRefund(intentId, refunded).catch((err) => {
          logger.error({ err, intentId }, "external refund reconciliation FAILED — tickets may still be valid");
          return null;
        });
        if (!result) logger.info({ intentId }, "stripe refund needed no reconciliation");
      }
    }

    res.json({ received: true });
  }),
);
