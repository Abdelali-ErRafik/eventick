import { Router, urlencoded } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/http.js";
import { cmiConfig, isApproved, verifyCallbackHash } from "../lib/cmi.js";
import { settleOrder } from "../lib/settle.js";
import { completeResale } from "../lib/resale.js";
import { logger } from "../lib/logger.js";

export const webhooksRouter = Router();

/**
 * CMI callback — the ONLY thing that turns a payment into tickets.
 *
 * The buyer's browser is never trusted for this: it can lie, close the tab, or
 * lose its network right after paying. CMI calls this endpoint server to
 * server, and it is also where a payment that succeeded on a closed tab still
 * gets its tickets.
 *
 * The endpoint is necessarily public and unauthenticated — CMI has no bearer
 * token to present — so the signature IS the authentication. A POST with a bad
 * or missing hash is a forgery attempt, not a payment, and is refused before
 * anything is read out of the body. Several CMI integrations in the wild check
 * only ProcReturnCode, which means anyone who guesses an order reference gets
 * free tickets.
 *
 * CMI posts form-encoded, not JSON, and expects a bare text reply:
 * "ACTION=POSTAUTH" to accept the transaction, anything else to refuse it.
 */
webhooksRouter.post(
  "/cmi",
  urlencoded({ extended: false }),
  asyncHandler(async (req, res) => {
    const config = cmiConfig();
    if (!config) {
      // Mock mode: nothing is configured, so there is no key to verify with.
      // Refuse rather than settle — accepting here would make the mock build
      // the easiest way to mint free tickets if it ever faced the internet.
      logger.warn("CMI callback received but CMI is not configured — refused");
      return res.type("text/plain").send("FAILURE");
    }

    const body = (req.body ?? {}) as Record<string, string>;

    if (!verifyCallbackHash(body, config.storeKey)) {
      logger.warn({ oid: body.oid }, "CMI callback REJECTED — hash mismatch (possible forgery)");
      return res.type("text/plain").send("FAILURE");
    }

    // Belt and braces: a hash computed with our key over someone else's
    // clientid should be impossible, but the merchant id is cheap to confirm.
    if (body.clientid && body.clientid !== config.clientId) {
      logger.warn({ clientid: body.clientid }, "CMI callback REJECTED — wrong merchant id");
      return res.type("text/plain").send("FAILURE");
    }

    const reference = body.oid;
    if (!reference) {
      logger.warn("CMI callback REJECTED — no order reference");
      return res.type("text/plain").send("FAILURE");
    }

    if (!isApproved(body)) {
      // Leave the order PENDING so the buyer can retry while the hold lasts;
      // the hold lapsing is what releases the seats.
      logger.info(
        { reference, code: body.ProcReturnCode, response: body.Response },
        "CMI payment declined",
      );
      return res.type("text/plain").send("FAILURE");
    }

    const order = await prisma.order.findUnique({ where: { id: reference } });
    if (!order) {
      logger.error({ reference }, "CMI approved a payment for an unknown order");
      return res.type("text/plain").send("FAILURE");
    }

    // The signed amount must match what we asked for. CMI should never alter
    // it, but settling on the gateway's number rather than our own is how an
    // underpaid order quietly becomes a valid ticket.
    const expected = (order.totalCents / 100).toFixed(2);
    if (body.amount && Number(body.amount) !== Number(expected)) {
      logger.error(
        { reference, paid: body.amount, expected },
        "CMI callback REJECTED — amount does not match the order",
      );
      return res.type("text/plain").send("FAILURE");
    }

    const gatewayRef = body.TransId ?? `CMI-${reference}`;

    // A resale buys one existing seat rather than fresh tier inventory, so it
    // settles through completeResale, not settleOrder. The listing was linked
    // to this order before the buyer left for the gateway.
    const listing = await prisma.resaleListing.findUnique({
      where: { pendingOrderId: order.id },
      select: { id: true },
    });
    if (listing) {
      const claimed = await prisma.order.updateMany({
        where: { id: order.id, status: "PENDING" },
        data: { status: "PAID", paymentRef: gatewayRef, gatewayRef },
      });
      // completeResale is itself guarded on status LISTED, so a replayed
      // callback cannot transfer the seat twice.
      if (claimed.count > 0) {
        await completeResale(listing.id, order.id).catch((err) =>
          logger.error({ err, listingId: listing.id }, "resale completion failed after payment"),
        );
      }
      logger.info({ orderId: order.id, replay: claimed.count === 0 }, "CMI resale settled");
      return res.type("text/plain").send("ACTION=POSTAUTH");
    }

    // settleOrder is idempotent: CMI retries deliveries, and a replay must be
    // a no-op rather than minting a second set of tickets.
    await prisma.order.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { gatewayRef },
    });
    const result = await settleOrder(order.id, {
      paymentRef: gatewayRef,
      cardBrand: body.CardType ?? null,
      cardLast4: last4(body.MaskedPan),
      cardBank: "CMI",
    });
    logger.info({ orderId: order.id, settled: result.settled }, "CMI payment settled");

    // Accept the transaction. Replies other than this leave CMI holding the
    // authorisation, so the buyer is debited and we issued the tickets anyway.
    res.type("text/plain").send("ACTION=POSTAUTH");
  }),
);

/** CMI sends a masked PAN like "423456******7890"; keep only the last four. */
function last4(maskedPan: string | undefined): string | null {
  if (!maskedPan) return null;
  const digits = maskedPan.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}
