import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { optionalAuth } from "../middleware/auth.js";
import { phoneOk, makePaymentRef } from "../lib/payment-sim.js";
import { isMockPayments, getStripe, CURRENCY } from "../lib/stripe.js";
import { cancelListing, completeResale, listTicketForResale, resolveListing } from "../lib/resale.js";
import { requireTicketAccessWithSession } from "../lib/order-access.js";

export const resaleRouter = Router();

// Ownership for seller actions lives in lib/order-access.ts. The copy that
// used to be here ended in "if this is a guest order, allow anyone", so a
// stranger holding a ticket id could act on a seat they never bought.

const listSchema = z.object({ ticketId: z.string() });

/** Put a ticket up for resale. Price is always face value — not a parameter. */
resaleRouter.post(
  "/listings",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = listSchema.parse(req.body);
    const ticket = await requireTicketAccessWithSession(req, body.ticketId);
    const listing = await listTicketForResale(ticket.id, ticket.order.customerId);
    res.status(201).json({
      id: listing.id,
      token: listing.token,
      priceCents: listing.priceCents,
      status: listing.status,
    });
  }),
);

resaleRouter.delete(
  "/listings/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const listing = await prisma.resaleListing.findUnique({ where: { id }, include: { ticket: true } });
    if (!listing) throw new HttpError(404, "Listing not found");
    await requireTicketAccessWithSession(req, listing.ticketId);
    await cancelListing(id);
    res.status(204).end();
  }),
);

/** Listings the caller is selling, for the "my tickets" view. */
resaleRouter.get(
  "/mine/listings",
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Sign in to see your listings");
    const listings = await prisma.resaleListing.findMany({
      where: { sellerId: req.user.id },
      include: { ticket: { include: { tier: true, order: { include: { event: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      listings: listings.map((listing) => ({
        id: listing.id,
        token: listing.token,
        status: listing.status,
        priceCents: listing.priceCents,
        ticketId: listing.ticketId,
        eventTitleFr: listing.ticket.order.event.titleFr,
        eventTitleAr: listing.ticket.order.event.titleAr,
        tierNameFr: listing.ticket.tier.nameFr,
        tierNameAr: listing.ticket.tier.nameAr,
        createdAt: listing.createdAt.toISOString(),
        soldAt: listing.soldAt?.toISOString() ?? null,
      })),
    });
  }),
);

/** What a shared listing link is offering. Public: the token is the credential. */
resaleRouter.get(
  "/:token",
  asyncHandler(async (req, res) => {
    const listing = await resolveListing(param(req, "token"));
    if (!listing) throw new HttpError(410, "This listing is no longer available");

    res.json({
      token: listing.token,
      priceCents: listing.priceCents,
      eventSlug: listing.ticket.order.event.slug,
      eventTitleFr: listing.ticket.order.event.titleFr,
      eventTitleAr: listing.ticket.order.event.titleAr,
      eventStart: listing.ticket.order.event.startAt.toISOString(),
      eventImage: listing.ticket.order.event.image,
      tierNameFr: listing.ticket.tier.nameFr,
      tierNameAr: listing.ticket.tier.nameAr,
      seatRow: listing.ticket.seatRow,
      seatNumber: listing.ticket.seatNumber,
    });
  }),
);

const buySchema = z.object({
  holderName: z.string().min(3),
  email: z.string().email(),
  phone: z.string(),
});

/**
 * Buy a listed ticket.
 *
 * Deliberately NOT the normal /orders/hold path: that claims fresh tier
 * inventory, whereas a resale moves one existing seat between owners. The
 * order created here carries no OrderLine, so it never affects the pool.
 */
resaleRouter.post(
  "/:token/buy",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = buySchema.parse(req.body);
    if (!phoneOk(body.phone)) throw new HttpError(400, "Invalid phone number");

    const listing = await resolveListing(param(req, "token"));
    if (!listing) throw new HttpError(410, "This listing is no longer available");

    const order = await prisma.order.create({
      data: {
        customerId: req.user?.id ?? null,
        eventId: listing.ticket.order.eventId,
        status: "PENDING",
        holderName: body.holderName.trim(),
        email: body.email.trim(),
        phone: body.phone.trim(),
        subtotalCents: listing.priceCents,
        discountCents: 0,
        totalCents: listing.priceCents,
      },
    });

    if (isMockPayments()) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "PAID", paymentRef: makePaymentRef(), cardBank: "Démo" },
      });
      const result = await completeResale(listing.id, order.id);
      return res.json({ mode: "mock", settled: true, orderId: order.id, ...result });
    }

    const stripe = getStripe()!;
    const intent = await stripe.paymentIntents.create(
      {
        amount: listing.priceCents,
        currency: CURRENCY,
        metadata: { orderId: order.id, resaleListingId: listing.id },
        receipt_email: order.email,
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: `resale_${listing.id}_${order.id}` },
    );
    await prisma.order.update({ where: { id: order.id }, data: { paymentIntentId: intent.id } });

    res.json({
      mode: "stripe",
      orderId: order.id,
      clientSecret: intent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
  }),
);

