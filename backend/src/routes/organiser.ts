import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { publicEvent, publicOrderWithContext } from "../lib/serialize.js";
import { remainingByTier } from "../lib/availability.js";

export const organiserRouter = Router();

organiserRouter.use(authenticate, requireRole("ORGANISER", "ADMIN"));

organiserRouter.get(
  "/events",
  asyncHandler(async (req, res) => {
    const events = await prisma.event.findMany({
      where: { organiserId: req.user!.id },
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

async function requireOwnedEvent(organiserId: string, role: string, slug: string) {
  const event = await prisma.event.findUnique({ where: { slug } });
  if (!event) throw new HttpError(404, "Event not found");
  if (event.organiserId !== organiserId && role !== "ADMIN") throw new HttpError(403, "Not your event");
  return event;
}

organiserRouter.patch(
  "/events/:slug/visibility",
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const event = await requireOwnedEvent(req.user!.id, req.user!.role, slug);
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
    const event = await requireOwnedEvent(req.user!.id, req.user!.role, slug);
    await prisma.event.delete({ where: { id: event.id } });
    res.status(204).end();
  }),
);

const updateEventSchema = z.object({
  titleFr: z.string().min(3).optional(),
  titleAr: z.string().min(3).optional(),
  city: z.string().optional(),
});

/** Content fields only (title/city) — not the tiers, which carry sold
 * tickets and shouldn't be silently rewritten from here. */
organiserRouter.patch(
  "/events/:slug",
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const event = await requireOwnedEvent(req.user!.id, req.user!.role, slug);
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
      where: { event: { organiserId: req.user!.id } },
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
    const event = await requireOwnedEvent(req.user!.id, req.user!.role, slug);
    const entries = await prisma.waitlistEntry.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ entries: entries.map((entry) => ({ email: entry.email, createdAt: entry.createdAt.toISOString() })) });
  }),
);

/** Richer than GET /orders above: full ticket detail (ref, status, tier,
 * event) so the Pro dashboard's Orders section can search/filter/admit
 * without a second round-trip per order. */
organiserRouter.get(
  "/orders/detailed",
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { event: { organiserId: req.user!.id } },
      include: { tickets: { include: { tier: { include: { event: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ orders: orders.map(publicOrderWithContext) });
  }),
);

async function requireOwnedOrder(organiserId: string, role: string, orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { event: true } });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.event.organiserId !== organiserId && role !== "ADMIN") throw new HttpError(403, "Not your order");
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
    await requireOwnedOrder(req.user!.id, req.user!.role, id);
    await prisma.$transaction([
      prisma.order.update({ where: { id }, data: { status: "CANCELLED" } }),
      prisma.ticket.updateMany({ where: { orderId: id }, data: { status: "CANCELLED" } }),
    ]);
    res.json({ ok: true });
  }),
);

organiserRouter.delete(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    await requireOwnedOrder(req.user!.id, req.user!.role, id);
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
    if (ticket.order.event.organiserId !== req.user!.id && req.user!.role !== "ADMIN") {
      throw new HttpError(403, "Not your ticket");
    }
    const updated = await prisma.ticket.update({
      where: { id },
      data: { status: body.status, usedAt: body.status === "USED" ? new Date() : null },
    });
    res.json({ ticket: { id: updated.id, status: updated.status } });
  }),
);
