import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { authenticate, requirePermission, userHasPermission } from "../middleware/auth.js";
import { organiserScope } from "../domain/auth.js";
import { publicEvent, publicOrderWithContext } from "../lib/serialize.js";
import { committedForTier, remainingByTier } from "../lib/availability.js";
import { broadcastRateLimit } from "../middleware/rateLimit.js";
import { sendEmail } from "../lib/email.js";
import { broadcastHtml } from "../lib/email-templates.js";
import { refundOrder } from "../lib/refund.js";
import { offerFreedSeats } from "../lib/waitlist.js";
import { reissueTicket, renameHolder } from "../lib/ticket-admin.js";

export const organiserRouter = Router();

organiserRouter.use(authenticate, requirePermission("events.manage"));

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
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const event = await requireOwnedEvent(req.user, slug);
    const recipients = await broadcastRecipients(event.id);
    res.json({ count: recipients.length });
  }),
);

organiserRouter.post(
  "/events/:slug/broadcast",
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
  asyncHandler(async (req, res) => {
    const events = await prisma.event.findMany({ where: await scopeFor(req), select: { id: true } });
    const eventIds = events.map((event) => event.id);

    if (eventIds.length === 0) {
      res.json({ gmvCents: 0, orders: 0, tickets: 0, inside: 0, generatedAt: new Date().toISOString() });
      return;
    }

    const [paid, tickets, inside] = await Promise.all([
      prisma.order.aggregate({
        where: { eventId: { in: eventIds }, status: "PAID" },
        _sum: { totalCents: true },
        _count: true,
      }),
      prisma.ticket.count({
        where: { order: { eventId: { in: eventIds } }, status: { not: "CANCELLED" } },
      }),
      prisma.ticket.count({
        where: { order: { eventId: { in: eventIds } }, status: "USED" },
      }),
    ]);

    res.json({
      gmvCents: paid._sum.totalCents ?? 0,
      orders: paid._count,
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
 * Refund an order. Unlike /cancel above this moves money: with Stripe
 * configured it calls the gateway, and in mock mode it records the refund so
 * the books stay consistent without pretending a card was touched.
 */
organiserRouter.post(
  "/orders/:id/refund",
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    await requireOwnedOrder(req.user, id);
    const body = refundSchema.parse(req.body ?? {});
    const result = await refundOrder(id, body.amountCents ?? null);
    res.json(result);
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
