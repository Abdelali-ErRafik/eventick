import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { authenticate, requirePermission, userHasPermission } from "../middleware/auth.js";
import { organiserScope } from "../domain/auth.js";
import { normaliseRib, ribOk, summariseRevenue } from "../domain/commission.js";
import { organiserEarnings } from "../lib/payout.js";
import { publicEvent, publicOrderWithContext } from "../lib/serialize.js";
import { committedForTier, remainingByTier } from "../lib/availability.js";
import { broadcastRateLimit } from "../middleware/rateLimit.js";
import { sendEmail } from "../lib/email.js";
import { broadcastHtml } from "../lib/email-templates.js";
import { reconcileExternalRefund, refundOrder } from "../lib/refund.js";
import { offerFreedSeats } from "../lib/waitlist.js";
import { reissueTicket, renameHolder } from "../lib/ticket-admin.js";

export const organiserRouter = Router();

/**
 * Authentication only. The capability check belongs on each route.
 *
 * This used to be `requirePermission("events.manage")` for the whole router,
 * which made four permissions decorative: finance.view, finance.refund,
 * orders.manage and gate.checkin were all in the vocabulary and all toggleable
 * in the Permissions screen, while nothing read them here. An admin could
 * revoke finance.view and the organiser would keep reading revenue — verified
 * before this was split, with /stats returning the gross after the revoke.
 *
 * It was also too broad in the other direction: someone granted only
 * orders.manage, to work the order desk and nothing else, could not reach the
 * order routes at all because they lacked events.manage.
 *
 * Each route below now names the capability it actually needs. `authenticate`
 * stays here because every one of them needs a user.
 */
organiserRouter.use(authenticate);

/** The catalogue: events and their ticket tiers. */
const canManageEvents = requirePermission("events.manage");
/** The order desk: reading orders, admitting, re-issuing, cancelling. */
const canManageOrders = requirePermission("orders.manage");
/** Revenue, payout and platform-fee figures. */
const canViewFinance = requirePermission("finance.view");
/** Moving money back to a buyer. */
const canRefund = requirePermission("finance.refund");

/**
 * The `?organiserId=` override on the list routes below.
 *
 * Returns the raw value; whether it is HONOURED is decided by
 * organiserScope(), which ignores it unless the caller may act platform-wide.
 * Parsing lives here, once, so there is exactly one place a future change
 * could get the parsing wrong — and exactly one place (organiserScope) that
 * can get the authorisation wrong.
 */
function requestedOrganiserId(req: { query: { organiserId?: unknown } }): string | undefined {
  const value = req.query.organiserId;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** The scope fragment for a list route, with the capability resolved. */
async function scopeFor(req: Request): Promise<{ organiserId?: string }> {
  const mayActAnywhere = await userHasPermission(req.user, "scope.any");
  return organiserScope(req.user!, mayActAnywhere, requestedOrganiserId(req));
}

organiserRouter.get(
  "/events",
  canManageEvents,
  asyncHandler(async (req, res) => {
    const events = await prisma.event.findMany({
      where: await scopeFor(req),
      include: { tiers: true, lineup: true },
      orderBy: { createdAt: "desc" },
    });
    const shaped = await Promise.all(
      events.map(async (event) => publicEvent(event, await remainingByTier(event.id))),
    );
    res.json({ events: shaped });
  }),
);

const tierInput = z.object({
  nameFr: z.string(),
  nameAr: z.string(),
  blurbFr: z.string(),
  blurbAr: z.string(),
  priceCents: z.number().int().min(0),
  capacity: z.number().int().min(1),
  numbered: z.boolean().optional(),
  seatsPerRow: z.number().int().min(1).max(100).optional(),
  perks: z.array(z.string()).optional(),
  zoneFr: z.string(),
  zoneAr: z.string(),
  gateFr: z.string(),
  gateAr: z.string(),
});

const createEventSchema = z.object({
  slug: z.string().min(3),
  titleFr: z.string().min(3),
  titleAr: z.string().min(3),
  category: z.string(),
  city: z.string(),
  venueFr: z.string(),
  venueAr: z.string(),
  address: z.string(),
  start: z.string(),
  end: z.string(),
  doors: z.string(),
  image: z.string(),
  blurbFr: z.string(),
  blurbAr: z.string(),
  aboutFr: z.string(),
  aboutAr: z.string(),
  ageFr: z.string(),
  ageAr: z.string(),
  tiers: z.array(tierInput).min(1),
});

organiserRouter.post(
  "/events",
  canManageEvents,
  asyncHandler(async (req, res) => {
    const body = createEventSchema.parse(req.body);
    const existing = await prisma.event.findUnique({ where: { slug: body.slug } });
    if (existing) throw new HttpError(409, "An event with this slug already exists");

    const event = await prisma.event.create({
      data: {
        slug: body.slug,
        organiserId: req.user!.id,
        status: "PUBLISHED",
        titleFr: body.titleFr,
        titleAr: body.titleAr,
        category: body.category,
        city: body.city,
        venueFr: body.venueFr,
        venueAr: body.venueAr,
        address: body.address,
        startAt: new Date(body.start),
        endAt: new Date(body.end),
        doorsAt: new Date(body.doors),
        image: body.image,
        blurbFr: body.blurbFr,
        blurbAr: body.blurbAr,
        aboutFr: body.aboutFr,
        aboutAr: body.aboutAr,
        ageFr: body.ageFr,
        ageAr: body.ageAr,
        tiers: { create: body.tiers },
      },
      include: { tiers: true, lineup: true },
    });
    res.status(201).json({ event: publicEvent(event, await remainingByTier(event.id)) });
  }),
);

async function requireOwnedEvent(user: Express.Request["user"], slug: string) {
  const event = await prisma.event.findUnique({ where: { slug } });
  if (!event) throw new HttpError(404, "Event not found");
  if (event.organiserId !== user!.id && !(await userHasPermission(user, "scope.any"))) {
    throw new HttpError(403, "Not your event");
  }
  return event;
}

organiserRouter.patch(
  "/events/:slug/visibility",
  canManageEvents,
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const event = await requireOwnedEvent(req.user, slug);
    const hidden = Boolean(req.body?.hidden);
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: { status: hidden ? "HIDDEN" : "PUBLISHED" },
      include: { tiers: true, lineup: true },
    });
    res.json({ event: publicEvent(updated, await remainingByTier(updated.id)) });
  }),
);

organiserRouter.delete(
  "/events/:slug",
  canManageEvents,
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const event = await requireOwnedEvent(req.user, slug);

    // Order -> Event is onDelete Restrict, so an event anyone has ever
    // ordered against cannot be deleted. Checking first turns what was a
    // raw Postgres 23001 and a 500 into an answer the organiser can act on:
    // an event with sales is history, and hiding it is the real intent.
    const orders = await prisma.order.count({ where: { eventId: event.id } });
    if (orders > 0) {
      throw new HttpError(
        409,
        `This event has ${orders} order(s) and cannot be deleted. Hide it instead to take it off sale.`,
      );
    }

    await prisma.event.delete({ where: { id: event.id } });
    res.status(204).end();
  }),
);

const updateEventSchema = z.object({
  titleFr: z.string().min(3).optional(),
  titleAr: z.string().min(3).optional(),
  city: z.string().optional(),
  image: z.string().optional(),
  cancelCutoffHours: z.number().int().min(0).max(8760).optional(),
});

/** Content fields only (title/city) — not the tiers, which carry sold
 * tickets and shouldn't be silently rewritten from here. */
organiserRouter.patch(
  "/events/:slug",
  canManageEvents,
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const event = await requireOwnedEvent(req.user, slug);
    const body = updateEventSchema.parse(req.body);
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: body,
      include: { tiers: true, lineup: true },
    });
    res.json({ event: publicEvent(updated, await remainingByTier(updated.id)) });
  }),
);

organiserRouter.get(
  "/orders",
  canManageOrders,
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { event: await scopeFor(req) },
      include: { tickets: true, event: { select: { titleFr: true, titleAr: true, slug: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      orders: orders.map((order) => ({
        id: order.id,
        status: order.status,
        holderName: order.holderName,
        email: order.email,
        totalCents: order.totalCents,
        createdAt: order.createdAt.toISOString(),
        eventSlug: order.event.slug,
        eventTitleFr: order.event.titleFr,
        ticketCount: order.tickets.length,
      })),
    });
  }),
);

organiserRouter.get(
  "/events/:slug/waitlist",
  canManageEvents,
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const event = await requireOwnedEvent(req.user, slug);
    const entries = await prisma.waitlistEntry.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      entries: entries.map((entry) => ({
        email: entry.email,
        createdAt: entry.createdAt.toISOString(),
        status: entry.status,
        offeredAt: entry.offeredAt?.toISOString() ?? null,
        claimExpiresAt: entry.claimExpiresAt?.toISOString() ?? null,
        // The token is a credential — the organiser's view never needs it.
      })),
    });
  }),
);

/** Richer than GET /orders above: full ticket detail (ref, status, tier,
 * event) so the Pro dashboard's Orders section can search/filter/admit
 * without a second round-trip per order. */
organiserRouter.get(
  "/orders/detailed",
  canManageOrders,
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { event: await scopeFor(req) },
      include: { tickets: { include: { tier: { include: { event: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ orders: orders.map((o) => publicOrderWithContext(o)) });
  }),
);

async function requireOwnedOrder(user: Express.Request["user"], orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { event: true } });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.event.organiserId !== user!.id && !(await userHasPermission(user, "scope.any"))) {
    throw new HttpError(403, "Not your order");
  }
  return order;
}

/** Cancels every ticket on the order and returns its inventory — mirrors the
 * same "status flip + implicit stock release" pattern remainingByTier()
 * already relies on (only PAID orders with VALID/USED tickets count against
 * capacity, so flipping to CANCELLED here is enough; no separate stock
 * counter to decrement). */
organiserRouter.post(
  "/orders/:id/cancel",
  canManageOrders,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const cancelled = await requireOwnedOrder(req.user, id);
    await prisma.$transaction([
      prisma.order.update({ where: { id }, data: { status: "CANCELLED" } }),
      prisma.ticket.updateMany({ where: { orderId: id }, data: { status: "CANCELLED" } }),
    ]);
    // Those seats are free again — offer them to the waitlist.
    void offerFreedSeats(cancelled.eventId);
    res.json({ ok: true });
  }),
);

organiserRouter.delete(
  "/orders/:id",
  canManageOrders,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    await requireOwnedOrder(req.user, id);
    await prisma.order.delete({ where: { id } });
    res.status(204).end();
  }),
);

const admitSchema = z.object({ status: z.enum(["VALID", "USED"]) });

/** Manual admit/undo toggle for the Orders desk — distinct from the gate's
 * ref-scan check-in (routes/gate.ts), which is the real entry point at the
 * door. This is for an organiser fixing a record after the fact. */
organiserRouter.patch(
  "/tickets/:id/status",
  canManageOrders,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const body = admitSchema.parse(req.body);
    const ticket = await prisma.ticket.findUnique({ where: { id }, include: { order: { include: { event: true } } } });
    if (!ticket) throw new HttpError(404, "Ticket not found");
    if (ticket.order.event.organiserId !== req.user!.id && !(await userHasPermission(req.user, "scope.any"))) {
      throw new HttpError(403, "Not your ticket");
    }
    const updated = await prisma.ticket.update({
      where: { id },
      data: { status: body.status, usedAt: body.status === "USED" ? new Date() : null },
    });
    res.json({ ticket: { id: updated.id, status: updated.status } });
  }),
);

const broadcastSchema = z.object({
  subject: z.string().min(3).max(150),
  message: z.string().min(10).max(5000),
});

/** Recipient list for a broadcast: one entry per distinct buyer address on
 * non-cancelled orders for this event. */
async function broadcastRecipients(eventId: string) {
  const orders = await prisma.order.findMany({
    where: { eventId, status: { not: "CANCELLED" } },
    select: { email: true, holderName: true },
  });
  const byEmail = new Map<string, string>();
  for (const order of orders) {
    if (!byEmail.has(order.email)) byEmail.set(order.email, order.holderName);
  }
  return [...byEmail.entries()].map(([email, name]) => ({ email, name }));
}

/** How many people a broadcast would reach — lets the UI show a count before
 * the organiser commits to sending. */
organiserRouter.get(
  "/events/:slug/audience",
  canManageEvents,
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const event = await requireOwnedEvent(req.user, slug);
    const recipients = await broadcastRecipients(event.id);
    res.json({ count: recipients.length });
  }),
);

organiserRouter.post(
  "/events/:slug/broadcast",
  canManageEvents,
  broadcastRateLimit,
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const event = await requireOwnedEvent(req.user, slug);
    const body = broadcastSchema.parse(req.body);

    const recipients = await broadcastRecipients(event.id);
    if (recipients.length === 0) throw new HttpError(422, "No buyers to contact for this event");

    const html = broadcastHtml({
      locale: "fr",
      eventTitle: event.titleFr,
      subject: body.subject,
      message: body.message,
    });

    // Sequential rather than Promise.all: a burst of parallel sends is what
    // trips provider rate limits, and this runs at human scale.
    let sent = 0;
    for (const recipient of recipients) {
      const ok = await sendEmail({ to: recipient.email, subject: body.subject, html });
      if (ok) sent += 1;
    }

    res.json({ recipients: recipients.length, sent });
  }),
);

/**
 * Lightweight dashboard counters, aggregated in SQL.
 *
 * Deliberately NOT /orders/detailed: that hydrates every order with every
 * ticket and each ticket's tier and event, which is fine to render a table
 * once and far too heavy to poll. These are COUNT/SUM over indexed columns.
 */
organiserRouter.get(
  "/stats",
  canViewFinance,
  asyncHandler(async (req, res) => {
    const events = await prisma.event.findMany({ where: await scopeFor(req), select: { id: true } });
    const eventIds = events.map((event) => event.id);

    if (eventIds.length === 0) {
      res.json({
        gmvCents: 0,
        grossCents: 0,
        refundedCents: 0,
        feeCents: 0,
        payableCents: 0,
        orders: 0,
        tickets: 0,
        inside: 0,
        generatedAt: new Date().toISOString(),
      });
      return;
    }

    /*
     * Revenue is counted NET OF REFUNDS.
     *
     * This used to sum `totalCents` of PAID orders only, which got it wrong
     * twice: a fully refunded order flips to REFUNDED and vanished from the
     * figure entirely, while a PARTIALLY refunded one stayed at full value.
     * So the headline revenue was neither gross nor net, and an organiser who
     * refunded half an order still saw all of it as earnings.
     */
    const [settled, tickets, inside] = await Promise.all([
      prisma.order.findMany({
        where: { eventId: { in: eventIds }, status: { in: ["PAID", "REFUNDED"] } },
        select: { totalCents: true, refundedCents: true, feeCents: true },
      }),
      prisma.ticket.count({
        where: { order: { eventId: { in: eventIds } }, status: { not: "CANCELLED" } },
      }),
      prisma.ticket.count({
        where: { order: { eventId: { in: eventIds } }, status: "USED" },
      }),
    ]);

    const fallback = (await prisma.plan.findFirst({ where: { isDefault: true } })) ?? undefined;
    const summary = summariseRevenue(settled, fallback);

    res.json({
      // Kept as `gmvCents` so existing callers do not break, but it is now
      // net of refunds rather than a gross figure.
      gmvCents: summary.netRevenueCents,
      grossCents: summary.grossCents,
      refundedCents: summary.refundedCents,
      feeCents: summary.feeCents,
      payableCents: summary.payableCents,
      orders: settled.length,
      tickets,
      inside,
      generatedAt: new Date().toISOString(),
    });
  }),
);

const refundSchema = z.object({
  /** Omit for a full refund of whatever is still outstanding. */
  amountCents: z.number().int().positive().optional(),
});

/**
 * Refund an order. Unlike /cancel above this concerns money.
 *
 * CMI has no refund API, so this does NOT move money: it records the refund,
 * voids the tickets on a full one, and emails the buyer. Reversing the
 * transaction is a manual step in the CMI back office, and the refund
 * reference says so.
 */
organiserRouter.post(
  "/orders/:id/refund",
  canRefund,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    await requireOwnedOrder(req.user, id);
    const body = refundSchema.parse(req.body ?? {});
    const result = await refundOrder(id, body.amountCents ?? null);
    res.json({ ...result, gatewayAction: "Reverse this transaction in the CMI back office." });
  }),
);

const reconcileSchema = z.object({
  /** The running TOTAL reversed at CMI for this transaction, in cents. */
  amountRefundedCents: z.number().int().positive(),
});

/**
 * Reconcile a refund already made in the CMI back office.
 *
 * CMI sends nothing when a merchant reverses a transaction there, so the
 * books can silently disagree with the gateway — and, worse, the tickets stay
 * VALID, meaning someone who has had their money back still gets in. This is
 * the manual correction for that, and it never moves money.
 */
organiserRouter.post(
  "/orders/:id/reconcile-refund",
  canRefund,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const order = await requireOwnedOrder(req.user, id);
    const body = reconcileSchema.parse(req.body ?? {});
    if (!order.gatewayRef) throw new HttpError(409, "This order has no gateway transaction to reconcile");
    const result = await reconcileExternalRefund(order.gatewayRef, body.amountRefundedCents);
    if (!result) return res.json({ reconciled: false, reason: "Already recorded" });
    res.json({ reconciled: true, ...result });
  }),
);

// ─── Placements: tier (zone) management ──────────────────────────────────
//
// Tiers used to be write-once — set at event creation and unchangeable after,
// so a wrong price or a missing zone meant deleting the event and starting
// again. These routes make a published event's seating editable, with the one
// rule that matters: nothing may invalidate a ticket already sold.

const tierPatchSchema = z.object({
  nameFr: z.string().min(1).optional(),
  nameAr: z.string().min(1).optional(),
  blurbFr: z.string().optional(),
  blurbAr: z.string().optional(),
  priceCents: z.number().int().min(0).optional(),
  capacity: z.number().int().min(1).optional(),
  numbered: z.boolean().optional(),
  seatsPerRow: z.number().int().min(1).max(100).optional(),
  perks: z.array(z.string()).optional(),
  recommended: z.boolean().optional(),
  zoneFr: z.string().optional(),
  zoneAr: z.string().optional(),
  gateFr: z.string().optional(),
  gateAr: z.string().optional(),
});

/** Seats of a tier someone already holds — the floor for a capacity change. */
const soldForTier = committedForTier;

/** Tiers of one event, each with what's already committed — the figure an
 * organiser needs before changing capacity. */
organiserRouter.get(
  "/events/:slug/tiers",
  canManageEvents,
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const event = await requireOwnedEvent(req.user, slug);
    const tiers = await prisma.ticketTier.findMany({ where: { eventId: event.id }, orderBy: { priceCents: "asc" } });
    const withSold = await Promise.all(
      tiers.map(async (tier) => {
        const sold = await soldForTier(tier.id);
        return { ...tier, sold, remaining: Math.max(0, tier.capacity - sold) };
      }),
    );
    res.json({ tiers: withSold });
  }),
);

organiserRouter.post(
  "/events/:slug/tiers",
  canManageEvents,
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const event = await requireOwnedEvent(req.user, slug);
    const body = tierInput.parse(req.body);
    const tier = await prisma.ticketTier.create({ data: { ...body, eventId: event.id } });
    res.status(201).json({ tier });
  }),
);

organiserRouter.patch(
  "/tiers/:id",
  canManageEvents,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const tier = await prisma.ticketTier.findUnique({ where: { id }, include: { event: true } });
    if (!tier) throw new HttpError(404, "Tier not found");
    if (tier.event.organiserId !== req.user!.id && !(await userHasPermission(req.user, "scope.any"))) {
      throw new HttpError(403, "Not your event");
    }
    const body = tierPatchSchema.parse(req.body);

    // Capacity may grow freely, but shrinking below what's already committed
    // would oversell retroactively — someone holding a valid ticket would
    // have no seat.
    if (body.capacity !== undefined) {
      const sold = await soldForTier(id);
      if (body.capacity < sold) {
        throw new HttpError(409, `Capacity cannot go below the ${sold} seat(s) already sold or held`);
      }
    }

    const updated = await prisma.ticketTier.update({ where: { id }, data: body });
    res.json({ tier: updated });
  }),
);

organiserRouter.delete(
  "/tiers/:id",
  canManageEvents,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const tier = await prisma.ticketTier.findUnique({ where: { id }, include: { event: { include: { tiers: true } } } });
    if (!tier) throw new HttpError(404, "Tier not found");
    if (tier.event.organiserId !== req.user!.id && !(await userHasPermission(req.user, "scope.any"))) {
      throw new HttpError(403, "Not your event");
    }

    // A tier with tickets against it is history, not inventory: deleting it
    // would cascade those tickets away. Set capacity to what's sold instead.
    const sold = await soldForTier(id);
    if (sold > 0) throw new HttpError(409, `This tier has ${sold} ticket(s) sold and cannot be deleted`);
    if (tier.event.tiers.length <= 1) throw new HttpError(409, "An event needs at least one ticket tier");

    await prisma.ticketTier.delete({ where: { id } });
    res.status(204).end();
  }),
);

// ─── Organiser-side ticket management ────────────────────────────────────

/** Reissue a lost ticket: the old ref and its QR stop working, a fresh one
 * replaces it. Voiding the old one is the point — the original may be in
 * someone else's hands, and leaving it valid would admit two people. */
organiserRouter.post(
  "/tickets/:id/reissue",
  canManageOrders,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { order: { include: { event: true } } },
    });
    if (!ticket) throw new HttpError(404, "Ticket not found");
    if (ticket.order.event.organiserId !== req.user!.id && !(await userHasPermission(req.user, "scope.any"))) {
      throw new HttpError(403, "Not your ticket");
    }
    const result = await reissueTicket(id);
    res.status(201).json(result);
  }),
);

const holderSchema = z.object({ holderName: z.string().min(2).max(80) });

/** Correct a misspelt holder name. Distinct from a transfer: the ticket stays
 * with the same buyer, the name just has to match the ID shown at the gate. */
organiserRouter.patch(
  "/tickets/:id/holder",
  canManageOrders,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const body = holderSchema.parse(req.body);
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { order: { include: { event: true } } },
    });
    if (!ticket) throw new HttpError(404, "Ticket not found");
    if (ticket.order.event.organiserId !== req.user!.id && !(await userHasPermission(req.user, "scope.any"))) {
      throw new HttpError(403, "Not your ticket");
    }
    await renameHolder(id, body.holderName);
    res.json({ ok: true });
  }),
);

// ─── Finance: earnings, commission and bank details ──────────────────────
//
// The Finance screen used to compute all of this in the browser from a plan
// the organiser chose from a <select>, and store none of it. These routes make
// the figures the server's, which is the only way they can mean anything: the
// commission is recorded on each order at settlement, and the plan is set by
// an admin.

/**
 * What this organiser has earned, what the platform took, and what is owed.
 *
 * Read-only on purpose. The plan comes back with the figures so the UI can
 * explain the fee, but there is no route here to CHANGE it — an organiser
 * picking their own commission rate is the bug this replaces.
 */
organiserRouter.get(
  "/finance",
  canViewFinance,
  asyncHandler(async (req, res) => {
    // Honours ?organiserId= only for a caller with scope.any, via the same
    // helper the list routes use.
    const scope = await scopeFor(req);
    const organiserId = scope.organiserId ?? req.user!.id;
    res.json(await organiserEarnings(organiserId));
  }),
);

/** Payouts to this organiser, newest first. */
organiserRouter.get(
  "/payouts",
  canViewFinance,
  asyncHandler(async (req, res) => {
    const scope = await scopeFor(req);
    const organiserId = scope.organiserId ?? req.user!.id;
    const payouts = await prisma.payout.findMany({
      where: { organiserId },
      select: {
        id: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        grossCents: true,
        feeCents: true,
        netCents: true,
        reference: true,
        note: true,
        createdAt: true,
        paidAt: true,
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      payouts: payouts.map((p) => ({
        id: p.id,
        status: p.status,
        periodStart: p.periodStart.toISOString(),
        periodEnd: p.periodEnd.toISOString(),
        grossCents: p.grossCents,
        feeCents: p.feeCents,
        netCents: p.netCents,
        reference: p.reference,
        note: p.note,
        orders: p._count.orders,
        createdAt: p.createdAt.toISOString(),
        paidAt: p.paidAt?.toISOString() ?? null,
      })),
    });
  }),
);

const bankSchema = z.object({
  holderName: z.string().min(3),
  /** Moroccan RIB. Validated below rather than by regex here, so the error
   * names the actual problem instead of "invalid format". */
  rib: z.string(),
  bank: z.string().optional(),
});

/**
 * Set where this organiser's money goes.
 *
 * The organiser owns this, not an admin: it is their bank account, and making
 * an admin type someone else's RIB is both a worse workflow and a worse place
 * for a typo. An admin can still read the last four through the payout screen.
 */
organiserRouter.put(
  "/bank-account",
  canViewFinance,
  asyncHandler(async (req, res) => {
    const body = bankSchema.parse(req.body);
    const rib = normaliseRib(body.rib);
    if (!ribOk(rib)) throw new HttpError(400, "A Moroccan RIB is exactly 24 digits");

    const saved = await prisma.bankAccount.upsert({
      where: { organiserId: req.user!.id },
      create: {
        organiserId: req.user!.id,
        holderName: body.holderName.trim(),
        rib,
        bank: body.bank?.trim() || null,
      },
      update: {
        holderName: body.holderName.trim(),
        rib,
        bank: body.bank?.trim() || null,
      },
      select: { holderName: true, rib: true, bank: true, updatedAt: true },
    });

    res.json({
      holderName: saved.holderName,
      // Echo back the last four only. Returning the full RIB would put a
      // payment credential in every response and in the browser's memory for
      // no benefit — the organiser just typed it.
      ribLast4: saved.rib.slice(-4),
      bank: saved.bank,
      updatedAt: saved.updatedAt.toISOString(),
    });
  }),
);
