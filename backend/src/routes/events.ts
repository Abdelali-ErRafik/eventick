import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { publicEvent } from "../lib/serialize.js";
import { remainingByTier } from "../lib/availability.js";

export const eventsRouter = Router();

const EVENT_INCLUDE = { tiers: true, lineup: true } as const;

eventsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const events = await prisma.event.findMany({
      where: { status: "PUBLISHED" },
      include: EVENT_INCLUDE,
      orderBy: { popularity: "desc" },
    });
    const shaped = await Promise.all(
      events.map(async (event) => publicEvent(event, await remainingByTier(event.id))),
    );
    res.json({ events: shaped });
  }),
);

eventsRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const event = await prisma.event.findUnique({ where: { slug }, include: EVENT_INCLUDE });
    if (!event || event.status !== "PUBLISHED") throw new HttpError(404, "Event not found");
    res.json({ event: publicEvent(event, await remainingByTier(event.id)) });
  }),
);
