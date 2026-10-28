import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { optionalAuth } from "../middleware/auth.js";
import { claimShare, resolveShare, revokeShare, shareTicket } from "../lib/share.js";
import { ticketPayload } from "../lib/ticket-signature.js";
import { newAccessToken, requireTicketAccess } from "../lib/order-access.js";

export const shareRouter = Router();

// Ownership for sender actions lives in lib/order-access.ts. The copy that
// used to be here ended in "if this is a guest order, allow anyone", so a
// stranger holding a ticket id could act on a seat they never bought.

const createSchema = z.object({
  ticketId: z.string(),
  message: z.string().max(280).optional(),
});

/** Create a share link for a ticket you hold. */
shareRouter.post(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const ticket = await requireTicketAccess(req, body.ticketId);
    const share = await shareTicket(ticket.id, ticket.order.customerId, body.message);
    res.status(201).json({
      id: share.id,
      token: share.token,
      status: share.status,
      createdAt: share.createdAt.toISOString(),
    });
  }),
);

/** Withdraw a link before anyone claims it. */
shareRouter.delete(
  "/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const share = await prisma.ticketShare.findUnique({ where: { id } });
    if (!share) throw new HttpError(404, "Share not found");
    await requireTicketAccess(req, share.ticketId);
    await revokeShare(id);
    res.status(204).end();
  }),
);

/** What a share link is offering. Public: the token is the credential. */
shareRouter.get(
  "/:token",
  asyncHandler(async (req, res) => {
    const share = await resolveShare(param(req, "token"));
    if (!share) throw new HttpError(410, "This share link is no longer valid");

    res.json({
      token: share.token,
      message: share.message,
      senderName: share.sender?.name ?? share.ticket.order.holderName,
      eventSlug: share.ticket.order.event.slug,
      eventTitleFr: share.ticket.order.event.titleFr,
      eventTitleAr: share.ticket.order.event.titleAr,
      eventStart: share.ticket.order.event.startAt.toISOString(),
      eventImage: share.ticket.order.event.image,
      tierNameFr: share.ticket.tier.nameFr,
      tierNameAr: share.ticket.tier.nameAr,
      seatRow: share.ticket.seatRow,
      seatNumber: share.ticket.seatNumber,
    });
  }),
);

const claimSchema = z.object({ holderName: z.string().min(3) });

/** Claim it: the sender's ticket is voided and a fresh one is issued here. */
shareRouter.post(
  "/:token/claim",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = claimSchema.parse(req.body);
    const result = await claimShare(param(req, "token"), body.holderName, req.user?.id ?? null);

    // The replacement ticket lives on the SENDER's order, so the recipient has
    // no order credential and must not be given one — it would unlock the
    // sender's other tickets. Mint a token scoped to this ticket alone.
    const ticket = await prisma.ticket.update({
      where: { id: result.ticketId },
      data: { accessToken: newAccessToken() },
      include: { order: { include: { event: true } } },
    });

    res.status(201).json({
      ticketId: ticket.id,
      ref: ticket.ref,
      // Returned once, here, to the person who just claimed it. This is what
      // their /billet/:id link carries from now on.
      accessToken: ticket.accessToken,
      qrPayload: ticketPayload(ticket.ref, ticket.order.event.slug),
    });
  }),
);
