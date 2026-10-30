import { Router } from "express";
import { z } from "zod";
import type { PromoCode } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { authenticate, requirePermission, userHasPermission } from "../middleware/auth.js";

export const promoRouter = Router();

promoRouter.use(authenticate, requirePermission("promo.manage"));

/**
 * May this caller act on this promo code?
 *
 * Three cases, and the middle one is the reason this helper exists:
 *   - holds scope.any  → yes, any promo on the platform
 *   - event-scoped     → only if they organise that event
 *   - global (eventId null) → only scope.any. A platform-wide code is not
 *     anybody's property, so "I am an organiser" is not enough to touch it.
 *
 * PATCH and DELETE previously had NO ownership check whatsoever: any
 * organiser could bump the usage cap on, or delete, another organiser's
 * code or a global one like SAFRAN15. Fixed here.
 */
async function assertMayManage(user: Express.Request["user"], promo: PromoCode): Promise<void> {
  if (await userHasPermission(user, "scope.any")) return;

  if (promo.eventId === null) {
    throw new HttpError(403, "Only an administrator can manage a platform-wide promo code");
  }

  const event = await prisma.event.findUnique({ where: { id: promo.eventId }, select: { organiserId: true } });
  if (!event || event.organiserId !== user!.id) throw new HttpError(403, "Not your promo code");
}

promoRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    // An admin (scope.any) sees every promo; everyone else sees their own
    // events' codes plus the global ones. Previously the admin case was
    // missing entirely, so an admin saw only promos on events they happened
    // to organise — inconsistent with every other list on the dashboard.
    const seesEverything = await userHasPermission(req.user, "scope.any");
    const promos = await prisma.promoCode.findMany({
      where: seesEverything ? {} : { OR: [{ event: { organiserId: req.user!.id } }, { eventId: null }] },
      orderBy: { createdAt: "desc" },
      /*
       * The event's slug and title, not just its id.
       *
       * The dashboard printed a raw cuid where the event name belongs —
       * "cmvut0no10016x1223irvqwyx" — because it tried to look the name up
       * by `eventId` against a list of events that carries only `slug`.
       * publicEvent() deliberately omits `id` (slug is the public
       * identifier), so that lookup could never match and the fallback was
       * the id itself.
       *
       * Sending the name with the promo removes the lookup rather than
       * fixing it: a card about a promo should not have to join two lists to
       * say which event it belongs to.
       */
      include: { event: { select: { slug: true, titleFr: true, titleAr: true } } },
    });
    res.json({
      promos: promos.map(({ event, ...promo }) => ({
        ...promo,
        eventSlug: event?.slug ?? null,
        eventTitleFr: event?.titleFr ?? null,
        eventTitleAr: event?.titleAr ?? null,
      })),
    });
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
    const mayActAnywhere = await userHasPermission(req.user, "scope.any");

    let eventId: string | null = null;
    if (body.eventSlug) {
      const event = await prisma.event.findUnique({ where: { slug: body.eventSlug } });
      if (!event || (event.organiserId !== req.user!.id && !mayActAnywhere)) {
        throw new HttpError(403, "Not your event");
      }
      eventId = event.id;
    } else if (!mayActAnywhere) {
      // Omitting eventSlug creates a PLATFORM-WIDE code valid on every
      // event. Any organiser could previously do this, which is a discount
      // on other people's ticket sales.
      throw new HttpError(403, "Only an administrator can create a platform-wide promo code");
    }

    const promo = await prisma.promoCode.create({
      data: { code: body.code.toUpperCase(), kind: body.kind, value: body.value, eventId, maxUses: body.maxUses },
    });
    res.status(201).json({ promo });
  }),
);

const updatePromoSchema = z.object({
  maxUses: z.number().int().min(1),
});

promoRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const body = updatePromoSchema.parse(req.body);
    const promo = await prisma.promoCode.findUnique({ where: { id } });
    if (!promo) throw new HttpError(404, "Promo not found");
    await assertMayManage(req.user, promo);

    const updated = await prisma.promoCode.update({ where: { id: promo.id }, data: { maxUses: body.maxUses } });
    res.json({ promo: updated });
  }),
);

promoRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const promo = await prisma.promoCode.findUnique({ where: { id } });
    if (!promo) throw new HttpError(404, "Promo not found");
    await assertMayManage(req.user, promo);

    await prisma.promoCode.delete({ where: { id: promo.id } });
    res.status(204).end();
  }),
);
