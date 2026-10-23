import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { authenticate } from "../middleware/auth.js";
import { publicTicket } from "../lib/serialize.js";

export const ticketsRouter = Router();

ticketsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { order: { include: { event: true } }, tier: true },
    });
    if (!ticket) throw new HttpError(404, "Ticket not found");
    res.json({
      ticket: publicTicket(ticket),
      event: {
        slug: ticket.order.event.slug,
        titleFr: ticket.order.event.titleFr,
        titleAr: ticket.order.event.titleAr,
        venueFr: ticket.order.event.venueFr,
        venueAr: ticket.order.event.venueAr,
        start: ticket.order.event.startAt.toISOString(),
      },
      tier: {
        nameFr: ticket.tier.nameFr,
        nameAr: ticket.tier.nameAr,
        zoneFr: ticket.tier.zoneFr,
        zoneAr: ticket.tier.zoneAr,
        gateFr: ticket.tier.gateFr,
        gateAr: ticket.tier.gateAr,
      },
    });
  }),
);

const transferSchema = z.object({ holderName: z.string().min(2) });

ticketsRouter.post(
  "/:id/transfer",
  authenticate,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const body = transferSchema.parse(req.body);
    const ticket = await prisma.ticket.findUnique({ where: { id }, include: { order: true } });
    if (!ticket) throw new HttpError(404, "Ticket not found");
    if (ticket.order.customerId !== req.user!.id) throw new HttpError(403, "Not your ticket");
    if (ticket.status !== "VALID") throw new HttpError(409, "Ticket cannot be transferred");

    const updated = await prisma.ticket.update({
      where: { id },
      data: { status: "TRANSFERRED", holderName: body.holderName },
    });
    res.json({ ticket: publicTicket(updated) });
  }),
);
