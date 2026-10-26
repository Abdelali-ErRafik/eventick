import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { publicEvent } from "../lib/serialize.js";
import { remainingByTier } from "../lib/availability.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import { quotePromo, type PromoCandidate } from "../domain/pricing.js";

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

const waitlistSchema = z.object({ email: z.string().email() });

eventsRouter.post(
  "/:slug/waitlist",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const body = waitlistSchema.parse(req.body);
    const event = await prisma.event.findUnique({ where: { slug } });
    if (!event) throw new HttpError(404, "Event not found");

    const existing = await prisma.waitlistEntry.findUnique({
      where: { eventId_email: { eventId: event.id, email: body.email.toLowerCase() } },
    });
    if (existing) throw new HttpError(409, "Already on the waitlist for this event");

    await prisma.waitlistEntry.create({ data: { eventId: event.id, email: body.email.toLowerCase() } });
    res.status(201).json({ ok: true });
  }),
);

/**
 * Read-only preview so Checkout can show "code applied, -X MAD" before the
 * buyer commits. The real checkout re-validates the same code inside the
 * order transaction (routes/orders.ts) — this route never reserves a use or
 * touches inventory, it only answers "would this code currently work".
 */
eventsRouter.get(
  "/:slug/quote-promo",
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const subtotalCents = Number(req.query.subtotalCents ?? 0);

    const event = await prisma.event.findUnique({ where: { slug } });
    if (!event) throw new HttpError(404, "Event not found");

    const candidates: PromoCandidate[] = (
      await prisma.promoCode.findMany({ where: { OR: [{ eventId: event.id }, { eventId: null }] } })
    ).map((promo) => ({
      id: promo.id,
      code: promo.code,
      kind: promo.kind,
      value: promo.value,
      eventId: promo.eventId,
      maxUses: promo.maxUses,
      uses: promo.uses,
    }));

    const quote = quotePromo(candidates, code, event.id, subtotalCents);
    if (!quote) {
      res.json({ valid: false, discountCents: 0 });
      return;
    }
    res.json({ valid: true, discountCents: quote.discountCents });
  }),
);
