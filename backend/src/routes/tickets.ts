import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { publicTicket } from "../lib/serialize.js";
import { renderTicketsPdf } from "../lib/ticket-pdf.js";
import { committedForTier } from "../lib/availability.js";
import { ticketPayload } from "../lib/ticket-signature.js";
import { cancelPolicy, exchangeTicket, renameHolder, selfCancelTicket } from "../lib/ticket-admin.js";
import { shareTicket } from "../lib/share.js";

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
      // Signed QR payload: only the server can produce this, so the client
      // renders the image but cannot forge what it encodes.
      qrPayload: ticketPayload(ticket.ref, ticket.order.event.slug),
      ticket: publicTicket(ticket),
      event: {
        slug: ticket.order.event.slug,
        titleFr: ticket.order.event.titleFr,
        titleAr: ticket.order.event.titleAr,
        venueFr: ticket.order.event.venueFr,
        venueAr: ticket.order.event.venueAr,
        image: ticket.order.event.image,
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
      order: {
        subtotalCents: ticket.order.subtotalCents,
        totalCents: ticket.order.totalCents,
        paymentRef: ticket.order.paymentRef,
        cardBank: ticket.order.cardBank,
        cardLast4: ticket.order.cardLast4,
      },
    });
  }),
);

/**
 * Ticket PDF. Readable by the buyer, the event's organiser, or an admin.
 * Guest orders (customerId null) stay reachable by anyone holding the ticket
 * id — the id is the capability, same as the confirmation page link.
 */
ticketsRouter.get(
  "/:id/pdf",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { tier: true, order: { include: { event: true } } },
    });
    if (!ticket) throw new HttpError(404, "Ticket not found");

    const order = ticket.order;
    const isOwner = order.customerId !== null && order.customerId === req.user?.id;
    const isOrganiser = req.user?.role === "ADMIN" || order.event.organiserId === req.user?.id;
    const isGuestOrder = order.customerId === null;
    if (!isOwner && !isOrganiser && !isGuestOrder) throw new HttpError(403, "Not your ticket");

    const pdf = await renderTicketsPdf([
      {
        ref: ticket.ref,
        holderName: ticket.holderName,
        eventSlug: order.event.slug,
        eventTitle: order.event.titleFr,
        venue: order.event.venueFr,
        city: order.event.city,
        startAt: order.event.startAt,
        tierName: ticket.tier.nameFr,
        zone: ticket.tier.zoneFr,
        gate: ticket.tier.gateFr,
        seatRow: ticket.seatRow,
        seatNumber: ticket.seatNumber,
        priceCents: ticket.tier.priceCents,
        orderId: order.id,
      },
    ]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${ticket.ref}.pdf"`);
    res.send(pdf);
  }),
);

/**
 * Transfer — kept for older clients, now backed by sharing.
 *
 * It used to mark the ticket TRANSFERRED (a status the gate REFUSES) and
 * issue nothing in its place, so a transfer destroyed the ticket and the
 * recipient got nothing. It now creates a share link the recipient claims,
 * which voids the sender's ticket only once a replacement exists.
 *
 * Renaming the holder on a ticket you keep is a different action —
 * PATCH /tickets/:id/holder.
 */
ticketsRouter.post(
  "/:id/transfer",
  authenticate,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const ticket = await prisma.ticket.findUnique({ where: { id }, include: { order: true } });
    if (!ticket) throw new HttpError(404, "Ticket not found");
    if (ticket.order.customerId !== req.user!.id) throw new HttpError(403, "Not your ticket");

    const share = await shareTicket(id, ticket.order.customerId);
    res.status(201).json({ shareId: share.id, token: share.token });
  }),
);

// ─── Buyer-side ticket management ────────────────────────────────────────

/** Ownership for buyer actions. Guest orders have no customer, so the ticket
 * id is the capability — the same rule the PDF and confirmation links use. */
async function requireOwnTicket(ticketId: string, userId: string | undefined) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { order: { include: { event: true } }, tier: true },
  });
  if (!ticket) throw new HttpError(404, "Ticket not found");
  const isGuestOrder = ticket.order.customerId === null;
  if (!isGuestOrder && ticket.order.customerId !== userId) throw new HttpError(403, "Not your ticket");
  return ticket;
}

/** What the holder may do with this ticket right now — lets the UI show the
 * cancellation deadline instead of offering a button that will fail. */
ticketsRouter.get(
  "/:id/options",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const ticket = await requireOwnTicket(param(req, "id"), req.user?.id);
    const policy = cancelPolicy(ticket);

    // Zones they could move to, with the extra due for each.
    const tiers = await prisma.ticketTier.findMany({
      where: { eventId: ticket.order.eventId },
      orderBy: { priceCents: "asc" },
    });
    const exchangeable = await Promise.all(
      tiers
        .filter((tier) => tier.id !== ticket.tierId)
        .map(async (tier) => {
          const committed = await committedForTier(tier.id);
          return {
            tierId: tier.id,
            nameFr: tier.nameFr,
            nameAr: tier.nameAr,
            priceCents: tier.priceCents,
            // Downgrades cost nothing and refund nothing.
            dueCents: Math.max(0, tier.priceCents - ticket.tier.priceCents),
            soldOut: committed >= tier.capacity,
          };
        }),
    );

    // An open share link, so the UI shows it back instead of offering a
    // "share" button that would only 409 on one already being out there.
    const openShare = await prisma.ticketShare.findFirst({
      where: { ticketId: ticket.id, status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      status: ticket.status,
      cancel: policy,
      exchange: exchangeable,
      share: openShare ? { id: openShare.id, token: openShare.token } : null,
      shareable:
        ticket.status === "VALID" && ticket.order.event.startAt.getTime() > Date.now() && !openShare,
    });
  }),
);

ticketsRouter.post(
  "/:id/cancel",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const ticket = await requireOwnTicket(param(req, "id"), req.user?.id);
    const result = await selfCancelTicket(ticket.id);
    res.json(result);
  }),
);

const exchangeSchema = z.object({ tierId: z.string() });

ticketsRouter.post(
  "/:id/exchange",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const ticket = await requireOwnTicket(param(req, "id"), req.user?.id);
    const body = exchangeSchema.parse(req.body);

    // State before price: a used or cancelled ticket can't be exchanged at
    // any price, so quoting an upgrade fee for one is the wrong answer.
    if (ticket.status !== "VALID") {
      throw new HttpError(409, "Only a valid ticket can be exchanged");
    }

    const target = await prisma.ticketTier.findUnique({ where: { id: body.tierId } });
    if (!target) throw new HttpError(404, "Zone not found");

    // An upgrade owes money. Until that is collected through Stripe the
    // exchange must not happen, so refuse rather than silently give it away.
    const dueCents = target.priceCents - ticket.tier.priceCents;
    if (dueCents > 0) {
      throw new HttpError(402, `An upgrade to this zone costs ${(dueCents / 100).toFixed(2)} MAD more`);
    }

    const result = await exchangeTicket(ticket.id, body.tierId);
    res.json(result);
  }),
);

const renameSchema = z.object({ holderName: z.string().min(2).max(80) });

ticketsRouter.patch(
  "/:id/holder",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const ticket = await requireOwnTicket(param(req, "id"), req.user?.id);
    const body = renameSchema.parse(req.body);
    await renameHolder(ticket.id, body.holderName);
    res.json({ ok: true });
  }),
);
