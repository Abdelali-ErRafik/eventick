import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { publicEvent } from "../lib/serialize.js";
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
