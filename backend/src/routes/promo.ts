import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const promoRouter = Router();

promoRouter.use(authenticate, requireRole("ORGANISER", "ADMIN"));

promoRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const promos = await prisma.promoCode.findMany({
      where: { OR: [{ event: { organiserId: req.user!.id } }, { eventId: null }] },
      orderBy: { createdAt: "desc" },
    });
    res.json({ promos });
  }),
);

const createPromoSchema = z.object({
  code: z.string().min(3),
  kind: z.enum(["PERCENT", "AMOUNT"]),
  value: z.number().int().min(1),
  eventSlug: z.string().optional(),
  maxUses: z.number().int().min(1),
});

promoRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createPromoSchema.parse(req.body);
    let eventId: string | null = null;
    if (body.eventSlug) {
      const event = await prisma.event.findUnique({ where: { slug: body.eventSlug } });
      if (!event || (event.organiserId !== req.user!.id && req.user!.role !== "ADMIN")) {
        throw new HttpError(403, "Not your event");
      }
      eventId = event.id;
    }
    const promo = await prisma.promoCode.create({
      data: { code: body.code.toUpperCase(), kind: body.kind, value: body.value, eventId, maxUses: body.maxUses },
    });
    res.status(201).json({ promo });
  }),
);

promoRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const promo = await prisma.promoCode.findUnique({ where: { id: req.params.id } });
    if (!promo) throw new HttpError(404, "Promo not found");
    await prisma.promoCode.delete({ where: { id: promo.id } });
    res.status(204).end();
  }),
);
