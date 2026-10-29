import type { Request } from "express";
import { prisma } from "./prisma.js";
import { HttpError } from "./http.js";
import { makeTicketRef } from "../domain/ticketRef.js";
import { seatFor } from "../domain/inventory.js";
import { sendEmail } from "./email.js";
import { logger } from "./logger.js";

/**
 * Comp tickets — the guest list.
 *
 * Press, sponsors, the artist's guests. Every real event has twenty to fifty
 * of these, and before this the only way to issue one was a 100% promo code —
 * which is the wrong tool: a promo code is a discount on a SALE, so it lands
 * in revenue, commission and the payout as a zero-value order and muddles all
 * three. A comp was never a sale.
 *
 * What a comp is: an ordinary Ticket with `kind: COMP`, on an order with
 * `totalCents: 0`. The gate, the PDF and the QR all work unchanged — the only
 * difference is that no money was involved, and the revenue figures know it.
 *
 * Comps DO consume capacity. A seat given away is still a seat, and an
 * organiser who comps fifty without that showing in availability oversells
 * the room.
 */

/** The order a comp hangs off. One per batch, so a guest list of 20 issued
 * together reads as one act rather than twenty. */
async function compOrder(eventId: string, issuerEmail: string) {
  return prisma.order.create({
    data: {
      eventId,
      // No customer: a comp belongs to the event, not to an account. The
      // guest may not have one.
      customerId: null,
      status: "PAID",
      holderName: "Invitations",
      email: issuerEmail,
      phone: "",
      subtotalCents: 0,
      discountCents: 0,
      totalCents: 0,
      // Says plainly in the order list that no card was involved.
      paymentRef: "COMP",
      // Deliberately NO feeCents: there is nothing to take a commission on.
      // Left null rather than 0 so it is distinguishable from a real sale
      // that genuinely owed nothing.
    },
    select: { id: true },
  });
}

export interface GuestInput {
  guestName: string;
  guestEmail?: string | null;
  note?: string | null;
}

export interface IssuedComp {
  invitationId: string;
  ticketId: string;
  ref: string;
  guestName: string;
  guestEmail: string | null;
  emailed: boolean;
}

/**
 * Issue comps for one tier, as a batch.
 *
 * Capacity is re-checked inside the transaction against the same "committed"
 * definition a sale uses, so comping cannot oversell a tier that is nearly
 * full — and cannot race a buyer who is paying at the same moment.
 */
export async function issueComps(
  req: Request,
  eventId: string,
  tierId: string,
  guests: GuestInput[],
): Promise<IssuedComp[]> {
  if (guests.length === 0) throw new HttpError(400, "Name at least one guest");
  if (guests.length > 100) {
    // A sanity bound, not a policy: a thousand-guest batch is a mistake or an
    // import, and both deserve to be split.
    throw new HttpError(400, "Issue at most 100 invitations at a time");
  }
  for (const guest of guests) {
    if (!guest.guestName?.trim()) throw new HttpError(400, "Every guest needs a name");
  }

  const issuerEmail = req.user?.email ?? "unknown";
  const issuerId = req.user?.id ?? null;

  const issued = await prisma.$transaction(async (tx) => {
    const tier = await tx.ticketTier.findFirst({
      where: { id: tierId, eventId },
      select: { id: true, capacity: true, numbered: true, seatsPerRow: true, event: { select: { startAt: true, status: true } } },
    });
    if (!tier) throw new HttpError(404, "Zone not found for this event");
    if (tier.event.status === "CANCELLED") throw new HttpError(409, "This event is cancelled");

    /*
     * A comp takes a real seat, so it is checked against capacity exactly as a
     * sale is. Must stay in step with lib/availability.ts and the hold route:
     * live tickets, plus holds that have not become tickets yet.
     */
    const live = await tx.ticket.count({ where: { tierId, status: { in: ["VALID", "USED"] } } });
    const holding = await tx.orderLine.aggregate({
      where: { tierId, order: { status: "PENDING", holdUntil: { gt: new Date() } } },
      _sum: { qty: true },
    });
    const free = tier.capacity - live - (holding._sum.qty ?? 0);
    if (guests.length > free) {
      throw new HttpError(409, `Only ${Math.max(0, free)} seat(s) left in this zone`);
    }

    const order = await compOrder(eventId, issuerEmail);

    // Seat cursor continues after everything already committed, so a numbered
    // comp does not collide with a sold seat.
    const committed = await tx.ticket.count({ where: { tierId, status: { in: ["VALID", "USED"] } } });

    const out: IssuedComp[] = [];
    for (const [index, guest] of guests.entries()) {
      const seat = tier.numbered ? seatFor(committed + index + 1, tier.seatsPerRow) : null;
      const ticket = await tx.ticket.create({
        data: {
          ref: makeTicketRef(tier.event.startAt.getFullYear()),
          orderId: order.id,
          tierId,
          // The GUEST's name on the ticket, not the issuer's — it is their
          // ticket, and the gate reads this.
          holderName: guest.guestName.trim(),
          kind: "COMP",
          seatRow: seat?.row ?? null,
          seatNumber: seat?.seat ?? null,
        },
        select: { id: true, ref: true },
      });

      const invitation = await tx.invitation.create({
        data: {
          eventId,
          tierId,
          guestName: guest.guestName.trim(),
          guestEmail: guest.guestEmail?.trim() || null,
          note: guest.note?.trim() || null,
          ticketId: ticket.id,
          issuedById: issuerId,
          issuedByEmail: issuerEmail,
        },
        select: { id: true },
      });

      out.push({
        invitationId: invitation.id,
        ticketId: ticket.id,
        ref: ticket.ref,
        guestName: guest.guestName.trim(),
        guestEmail: guest.guestEmail?.trim() || null,
        emailed: false,
      });
    }
    return out;
  });

  logger.info({ eventId, tierId, count: issued.length, by: issuerEmail }, "comp tickets issued");

  // Email after the transaction: a mail failure must not undo tickets that
  // already exist, and a guest with no address is a normal case.
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { titleFr: true } });
  for (const comp of issued) {
    if (!comp.guestEmail) continue;
    comp.emailed = true;
    void sendEmail({
      to: comp.guestEmail,
      subject: `Votre invitation — ${event?.titleFr ?? "Eventick"}`,
      html: inviteHtml(event?.titleFr ?? "", comp.guestName, comp.ref),
    })
      .then(() => prisma.invitation.update({ where: { id: comp.invitationId }, data: { sentAt: new Date() } }))
      .catch((err) => logger.warn({ err, invitationId: comp.invitationId }, "invitation email failed"));
  }

  return issued;
}

/** Revoke a comp: void the ticket, keep the guest on the list. */
export async function revokeComp(invitationId: string): Promise<void> {
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    select: { id: true, ticketId: true, ticket: { select: { status: true } } },
  });
  if (!invitation) throw new HttpError(404, "Invitation not found");
  if (!invitation.ticketId) throw new HttpError(409, "This invitation has no ticket to revoke");
  if (invitation.ticket?.status === "CANCELLED") throw new HttpError(409, "This invitation is already revoked");

  await prisma.ticket.update({
    where: { id: invitation.ticketId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  // The invitation row STAYS, pointing at the cancelled ticket: "issued, then
  // revoked" is information an organiser wants on the guest list, and deleting
  // it would just make the guest vanish.
  logger.info({ invitationId }, "comp ticket revoked");
}

function inviteHtml(title: string, guestName: string, ref: string): string {
  const esc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<div style="font-family:system-ui,sans-serif;line-height:1.6">
    <h2 style="margin:0 0 12px">Votre invitation</h2>
    <p>Bonjour ${esc(guestName)},</p>
    <p>Vous êtes invité(e) à <strong>${esc(title)}</strong>.</p>
    <p>Référence de votre billet : <strong>${esc(ref)}</strong></p>
    <p>Présentez-la à l'entrée. Ce billet est nominatif.</p>
    <p style="color:#5f5f6b;font-size:13px">Eventick.ma</p>
  </div>`;
}
