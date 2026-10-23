import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { optionalAuth, authenticate } from "../middleware/auth.js";
import { checkQuantity, holdExpiry, seatFor, tierRemaining } from "../domain/inventory.js";
import { quotePromo, type PromoCandidate } from "../domain/pricing.js";
import { makeTicketRef } from "../domain/ticketRef.js";
import {
  bankFromNumber,
  cardBrand,
  digitsOnly,
  DEMO_3DS,
  expOk,
  luhnOk,
  makePaymentRef,
  phoneOk,
} from "../lib/payment-sim.js";
import { publicOrder } from "../lib/serialize.js";
import { remainingByTier } from "../lib/availability.js";

export const ordersRouter = Router();

const checkoutSchema = z.object({
  eventSlug: z.string(),
  lines: z.array(z.object({ tierId: z.string(), qty: z.number().int().min(1) })).min(1),
  holderName: z.string().min(3),
  email: z.string().email(),
  phone: z.string(),
  pan: z.string(),
  exp: z.string(),
  otp: z.string(),
  promoCode: z.string().optional(),
});

/**
 * One-shot checkout: validates stock + card + OTP, then commits the order,
 * order lines and tickets inside a single transaction that re-checks
 * remaining stock at write time. This is what replaces the old client-only
 * Zustand `placeOrder` — two concurrent buyers for the last seat can no
 * longer both succeed, because the stock re-check and the write happen
 * atomically instead of as a separate read-then-write in the browser.
 */
ordersRouter.post(
  "/checkout",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = checkoutSchema.parse(req.body);

    if (!phoneOk(body.phone)) throw new HttpError(400, "Invalid phone number");
    if (!luhnOk(body.pan)) throw new HttpError(400, "Invalid card number");
    if (!expOk(body.exp)) throw new HttpError(400, "Card has expired");
    if (body.otp.trim() !== DEMO_3DS) throw new HttpError(400, "Incorrect 3-D Secure code");

    const event = await prisma.event.findUnique({ where: { slug: body.eventSlug } });
    if (!event || event.status !== "PUBLISHED") throw new HttpError(404, "Event not found");

    const order = await prisma.$transaction(async (tx) => {
      const tiers = await tx.ticketTier.findMany({
        where: { id: { in: body.lines.map((line) => line.tierId) }, eventId: event.id },
      });
      if (tiers.length !== body.lines.length) throw new HttpError(400, "Invalid ticket tier");

      const committedLines = await tx.orderLine.findMany({
        where: {
          tierId: { in: tiers.map((tier) => tier.id) },
          order: { OR: [{ status: "PAID" }, { status: "PENDING", holdUntil: { gt: new Date() } }] },
        },
      });
      const committed = new Map<string, number>();
      for (const line of committedLines) {
        committed.set(line.tierId, (committed.get(line.tierId) ?? 0) + line.qty);
      }

      let subtotalCents = 0;
      for (const line of body.lines) {
        const tier = tiers.find((item) => item.id === line.tierId)!;
        const remaining = tierRemaining(tier.capacity, committed.get(tier.id) ?? 0);
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

      const brand = cardBrand(body.pan);
      const last4 = digitsOnly(body.pan).slice(-4);
      const bank = bankFromNumber(body.pan);

      const createdOrder = await tx.order.create({
        data: {
          customerId: req.user?.id ?? null,
          eventId: event.id,
          status: "PAID",
          holderName: body.holderName,
          email: body.email,
          phone: body.phone,
          subtotalCents,
          discountCents,
          totalCents: subtotalCents - discountCents,
          promoCodeId: appliedPromo?.id ?? null,
          holdUntil: holdExpiry(),
          paymentRef: makePaymentRef(),
          cardBrand: brand,
          cardLast4: last4,
          cardBank: bank,
        },
      });

      for (const line of body.lines) {
        const tier = tiers.find((item) => item.id === line.tierId)!;
        await tx.orderLine.create({ data: { orderId: createdOrder.id, tierId: tier.id, qty: line.qty } });

        const cursorStart = committed.get(tier.id) ?? 0;
        for (let i = 0; i < line.qty; i++) {
          const cursor = cursorStart + i + 1;
          const seat = tier.numbered ? seatFor(cursor) : null;
          await tx.ticket.create({
            data: {
              ref: makeTicketRef(event.startAt.getFullYear()),
              orderId: createdOrder.id,
              tierId: tier.id,
              holderName: body.holderName,
              seatRow: seat?.row,
              seatNumber: seat?.seat,
            },
          });
        }
      }

      if (appliedPromo) {
        await tx.promoCode.update({ where: { id: appliedPromo.id }, data: { uses: { increment: 1 } } });
      }

      return tx.order.findUniqueOrThrow({ where: { id: createdOrder.id }, include: { tickets: true } });
    });

    res.status(201).json({ order: publicOrder(order) });
  }),
);

ordersRouter.get(
  "/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const order = await prisma.order.findUnique({ where: { id }, include: { tickets: true } });
    if (!order) throw new HttpError(404, "Order not found");
    res.json({ order: publicOrder(order) });
  }),
);

ordersRouter.get(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { customerId: req.user!.id },
      include: { tickets: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ orders: orders.map(publicOrder) });
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
