import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { optionalAuth, authenticate } from "../middleware/auth.js";
import { checkQuantity, holdExpiry, tierRemaining } from "../domain/inventory.js";
import { quotePromo, type PromoCandidate } from "../domain/pricing.js";
import { phoneOk, makePaymentRef } from "../lib/payment-sim.js";
import { publicOrder, publicOrderWithContext } from "../lib/serialize.js";
import { remainingByTier } from "../lib/availability.js";
import { getStripe, isMockPayments, CURRENCY } from "../lib/stripe.js";
import { settleOrder } from "../lib/settle.js";
import { withSerializableRetry } from "../lib/serializable.js";
import { markClaimed, offerFreedSeats, resolveClaim } from "../lib/waitlist.js";

export const ordersRouter = Router();

const holdSchema = z.object({
  eventSlug: z.string(),
  lines: z.array(z.object({ tierId: z.string(), qty: z.number().int().min(1) })).min(1),
  // Buyer details are OPTIONAL here and required at /pay. The seat is claimed
  // the moment someone presses Book, before they type anything — otherwise a
  // buyer fills in a whole form and only then learns the tickets went to
  // someone else, which is the one outcome this flow exists to prevent.
  holderName: z.string().min(3).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  promoCode: z.string().optional(),
  /** Waitlist claim token. The seat it names is reserved for this person, so
   * it is counted as available to them even when the tier reads sold out. */
  claimToken: z.string().optional(),
});

/**
 * Step 1 — reserve. Creates a PENDING order holding its seats until
 * `holdUntil`, inside a transaction that re-counts committed stock at write
 * time so two buyers can't both claim the last seat.
 *
 * This replaces the old one-shot /checkout, which took a raw card number over
 * the wire and marked the order PAID in the same request. No card data reaches
 * this API any more: step 2 hands the card straight to Stripe.
 */
ordersRouter.post(
  "/hold",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = holdSchema.parse(req.body);
    if (body.phone && !phoneOk(body.phone)) throw new HttpError(400, "Invalid phone number");

    const event = await prisma.event.findUnique({ where: { slug: body.eventSlug } });
    if (!event || event.status !== "PUBLISHED") throw new HttpError(404, "Event not found");

    // A waitlist offer reserves one seat of one tier for this person. It is
    // excluded from the committed count below, so they can take the seat the
    // offer promised even though the tier reads sold out to everyone else.
    const claim = body.claimToken ? await resolveClaim(body.claimToken) : null;
    if (body.claimToken && !claim) throw new HttpError(410, "This offer has expired or is no longer valid");
    if (claim && claim.eventId !== event.id) throw new HttpError(400, "This offer is for a different event");

    const order = await withSerializableRetry(async (tx) => {
      const tiers = await tx.ticketTier.findMany({
        where: { id: { in: body.lines.map((line) => line.tierId) }, eventId: event.id },
      });
      if (tiers.length !== body.lines.length) throw new HttpError(400, "Invalid ticket tier");

      // Count ISSUED TICKETS, not paid orders. A resold seat leaves the
      // seller's order REFUNDED while the buyer's ticket lives on — counting
      // orders would hand that seat out a second time. Must stay in step with
      // lib/availability.ts, which answers the same question for display.
      const issued = await tx.ticket.groupBy({
        by: ["tierId"],
        where: { tierId: { in: tiers.map((tier) => tier.id) }, status: { in: ["VALID", "USED"] } },
        _count: { _all: true },
      });
      const committed = new Map<string, number>();
      for (const row of issued) {
        committed.set(row.tierId, row._count._all);
      }

      // Live holds that haven't produced tickets yet.
      const pendingLines = await tx.orderLine.findMany({
        where: {
          tierId: { in: tiers.map((tier) => tier.id) },
          order: { status: "PENDING", holdUntil: { gt: new Date() } },
        },
      });
      for (const line of pendingLines) {
        committed.set(line.tierId, (committed.get(line.tierId) ?? 0) + line.qty);
      }

      // Outstanding waitlist offers reserve seats too — without this a
      // walk-up buyer could take the seat already promised to someone in the
      // queue, and the offer email would lead to a sold-out page.
      const offers = await tx.waitlistEntry.groupBy({
        by: ["claimTierId"],
        where: {
          claimTierId: { in: tiers.map((tier) => tier.id) },
          status: "OFFERED",
          claimExpiresAt: { gt: new Date() },
        },
        _count: { _all: true },
      });
      for (const offer of offers) {
        if (!offer.claimTierId) continue;
        committed.set(offer.claimTierId, (committed.get(offer.claimTierId) ?? 0) + offer._count._all);
      }

      let subtotalCents = 0;
      for (const line of body.lines) {
        const tier = tiers.find((item) => item.id === line.tierId)!;
        // The claimed seat is already counted in `committed` as part of the
        // outstanding offer; credit it back so its owner can actually take it.
        const reserved = claim?.claimTierId === tier.id ? 1 : 0;
        const remaining = tierRemaining(tier.capacity, (committed.get(tier.id) ?? 0) - reserved);
        const check = checkQuantity(line.qty, remaining);
        if (!check.ok) throw new HttpError(409, check.reason ?? "Oversold");
        subtotalCents += tier.priceCents * line.qty;
      }

      let discountCents = 0;
      let appliedPromo: PromoCandidate | null = null;
      if (body.promoCode?.trim()) {
        const candidates: PromoCandidate[] = (
          await tx.promoCode.findMany({ where: { OR: [{ eventId: event.id }, { eventId: null }] } })
        ).map((promo) => ({
          id: promo.id,
          code: promo.code,
          kind: promo.kind,
          value: promo.value,
          eventId: promo.eventId,
          maxUses: promo.maxUses,
          uses: promo.uses,
        }));
        const quote = quotePromo(candidates, body.promoCode, event.id, subtotalCents);
        if (!quote) throw new HttpError(400, "Invalid or expired promo code");
        discountCents = quote.discountCents;
        appliedPromo = quote.promo;
      }

      const created = await tx.order.create({
        data: {
          customerId: req.user?.id ?? null,
          eventId: event.id,
          status: "PENDING",
          // Blank until /pay collects them — the reservation is what matters
          // at this point, not who it belongs to.
          holderName: body.holderName ?? "",
          email: body.email ?? "",
          phone: body.phone ?? "",
          subtotalCents,
          discountCents,
          totalCents: subtotalCents - discountCents,
          promoCodeId: appliedPromo?.id ?? null,
          holdUntil: holdExpiry(),
        },
      });

      for (const line of body.lines) {
        await tx.orderLine.create({ data: { orderId: created.id, tierId: line.tierId, qty: line.qty } });
      }

      return tx.order.findUniqueOrThrow({ where: { id: created.id }, include: { tickets: true } });
    });

    res.status(201).json({
      order: publicOrder(order),
      holdUntil: order.holdUntil?.toISOString() ?? null,
      claimEntryId: claim?.id ?? null,
    });
  }),
);

/** Release a hold the buyer abandoned, returning its seats immediately
 * instead of waiting for the hold to lapse. */
ordersRouter.delete(
  "/hold/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.status !== "PENDING") throw new HttpError(409, "Order is no longer pending");
    await prisma.order.update({ where: { id }, data: { status: "CANCELLED", holdUntil: null } });
    // An abandoned cart returns seats — offer them to whoever is waiting.
    void offerFreedSeats(order.eventId);
    res.status(204).end();
  }),
);

const paySchema = z.object({
  holderName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  /** Waitlist entry this order came from, so paying it closes the offer. */
  claimEntryId: z.string().optional(),
});

/**
 * Step 2 — pay. Creates a Stripe PaymentIntent for the held order and returns
 * its client secret; the browser confirms it with Stripe directly, so the card
 * never touches this server. 3-D Secure is handled by Stripe's own challenge.
 *
 * In mock mode (no STRIPE_SECRET_KEY) there is no gateway, so the order is
 * settled on the spot and the response says so.
 */
ordersRouter.post(
  "/:id/pay",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const body = paySchema.parse(req.body ?? {});
    const order = await prisma.order.findUnique({ where: { id }, include: { event: true } });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.status === "PAID") throw new HttpError(409, "Order is already paid");
    if (order.status !== "PENDING") throw new HttpError(409, "Order is no longer payable");
    if (order.holdUntil && order.holdUntil.getTime() < Date.now()) {
      throw new HttpError(410, "Hold expired — please start again");
    }

    // Buyer details arrive here, not at hold time. Required before money
    // moves: a ticket with no name or address can't be delivered or checked.
    const holderName = body.holderName ?? order.holderName;
    const email = body.email ?? order.email;
    const phone = body.phone ?? order.phone;
    if (holderName.trim().length < 3) throw new HttpError(400, "Buyer name is required");
    if (!email.includes("@")) throw new HttpError(400, "A valid email is required");
    if (!phoneOk(phone)) throw new HttpError(400, "Invalid phone number");

    if (holderName !== order.holderName || email !== order.email || phone !== order.phone) {
      await prisma.order.update({ where: { id: order.id }, data: { holderName, email, phone } });
      order.holderName = holderName;
      order.email = email;
      order.phone = phone;
    }

    if (isMockPayments()) {
      const result = await settleOrder(order.id, { paymentRef: makePaymentRef(), cardBank: "Démo" });
      if (!result.settled) throw new HttpError(409, "Order could not be settled");
      if (body.claimEntryId) await markClaimed(body.claimEntryId);
      return res.json({ mode: "mock", settled: true });
    }

    const stripe = getStripe()!;
    const intent = await stripe.paymentIntents.create(
      {
        amount: order.totalCents,
        currency: CURRENCY,
        metadata: { orderId: order.id, eventSlug: order.event.slug },
        receipt_email: order.email,
        automatic_payment_methods: { enabled: true },
      },
      // Idempotency: a double-clicked Pay button reuses the same intent
      // instead of creating a second charge for the same order.
      { idempotencyKey: `order_${order.id}` },
    );

    await prisma.order.update({ where: { id: order.id }, data: { paymentIntentId: intent.id } });

    res.json({ mode: "stripe", clientSecret: intent.client_secret, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
  }),
);

ordersRouter.get(
  "/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const order = await prisma.order.findUnique({
      where: { id },
      include: { tickets: { include: { tier: { include: { event: true } } } } },
    });
    if (!order) throw new HttpError(404, "Order not found");
    res.json({ order: publicOrderWithContext(order) });
  }),
);

ordersRouter.get(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { customerId: req.user!.id },
      include: { tickets: { include: { tier: { include: { event: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ orders: orders.map(publicOrderWithContext) });
  }),
);

// Exposed for the event-detail screen's live "n seats left" display.
ordersRouter.get(
  "/availability/:slug",
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const event = await prisma.event.findUnique({ where: { slug } });
    if (!event) throw new HttpError(404, "Event not found");
    res.json({ remaining: await remainingByTier(event.id) });
  }),
);
