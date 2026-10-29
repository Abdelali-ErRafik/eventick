import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { seatFor } from "../domain/inventory.js";
import { makeTicketRef } from "../domain/ticketRef.js";
import { sendEmail } from "./email.js";
import { orderConfirmationHtml, orderConfirmationSubject } from "./email-templates.js";
import { renderTicketsPdf } from "./ticket-pdf.js";
import { logger } from "./logger.js";
import { emitToOrganiser } from "./realtime.js";
import type { Event, Order, Ticket, TicketTier } from "@prisma/client";

/**
 * The seats went while the buyer was at the gateway.
 *
 * Its own type because the caller has to tell it apart from an infrastructure
 * failure: this one means "do not take the money", whereas a dropped database
 * connection means "we do not know yet".
 */
export class OversoldError extends Error {
  constructor(
    readonly orderId: string,
    readonly tierId: string,
    readonly wanted: number,
    readonly available: number,
  ) {
    super(`Order ${orderId} wanted ${wanted} seat(s) of tier ${tierId}, only ${available} left`);
    this.name = "OversoldError";
  }
}

/**
 * Settlement — the one place a successful payment turns into tickets.
 *
 * Both paths funnel through here so they can never drift: the CMI callback
 * (real mode) and the direct confirm (mock mode). IDEMPOTENT by necessity —
 * CMI retries a callback it considers unanswered, so applying the same outcome
 * twice must be a no-op rather than minting a second set of tickets.
 *
 * Returns `settled: false` for BOTH "already settled" and "could not settle".
 * Callers that decide whether to take the buyer's money must therefore look at
 * the order's real state rather than trust this flag — see routes/webhooks.ts.
 */
export async function settleOrder(orderId: string, payment: {
  paymentRef: string;
  cardBrand?: string | null;
  cardLast4?: string | null;
  cardBank?: string | null;
}): Promise<{ settled: boolean }> {
  const order = await prisma.$transaction(async (tx) => {
    // Guarded update: only a PENDING order becomes PAID. A replayed webhook
    // finds 0 rows and stops here instead of issuing duplicate tickets.
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: "PENDING" },
      data: {
        status: "PAID",
        paymentRef: payment.paymentRef,
        cardBrand: payment.cardBrand ?? null,
        cardLast4: payment.cardLast4 ?? null,
        cardBank: payment.cardBank ?? null,
      },
    });
    if (claimed.count === 0) return null;

    const current = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { lines: { include: { tier: true } }, event: true },
    });

    /*
     * Re-check capacity before issuing, not just at hold time.
     *
     * A hold reserves seats until `holdUntil`, and availability stops counting
     * it the moment that passes — but the order stays PENDING until the
     * sweeper runs, up to five minutes later. With Stripe that gap was
     * unreachable: the card was confirmed in-page, in seconds. CMI sends the
     * buyer away to its own hosted page, where finding a card and passing
     * 3-D Secure can easily outlast the hold, so a payment arriving in that
     * window would issue tickets against seats already resold to someone
     * else. Checking here covers every settlement path at once.
     */
    for (const line of current.lines) {
      const live = await tx.ticket.count({
        where: { tierId: line.tierId, status: { in: ["VALID", "USED"] } },
      });
      const otherHolds = await tx.orderLine.aggregate({
        where: {
          tierId: line.tierId,
          orderId: { not: current.id },
          order: { status: "PENDING", holdUntil: { gt: new Date() } },
        },
        _sum: { qty: true },
      });
      const free = line.tier.capacity - live - (otherHolds._sum.qty ?? 0);
      if (line.qty > free) {
        // Throwing rolls back the PAID flip with it, leaving the order PENDING
        // so the caller can refuse the payment rather than charge for a seat
        // that no longer exists.
        throw new OversoldError(current.id, line.tierId, line.qty, free);
      }
    }

    for (const line of current.lines) {
      // Seat cursor starts after everything already committed for this tier,
      // so numbered seats stay unique across orders.
      const committed = await tx.orderLine.aggregate({
        where: {
          tierId: line.tierId,
          order: { status: "PAID" },
          NOT: { orderId: current.id },
        },
        _sum: { qty: true },
      });
      const cursorStart = committed._sum.qty ?? 0;

      const rows: Prisma.TicketCreateManyInput[] = [];
      for (let i = 0; i < line.qty; i++) {
        const seat = line.tier.numbered ? seatFor(cursorStart + i + 1, line.tier.seatsPerRow) : null;
        rows.push({
          ref: makeTicketRef(current.event.startAt.getFullYear()),
          orderId: current.id,
          tierId: line.tierId,
          holderName: current.holderName,
          seatRow: seat?.row ?? null,
          seatNumber: seat?.seat ?? null,
        });
      }
      // createMany: one round-trip per line instead of one per ticket, which
      // matters for the "ticket within 30s" target on large orders.
      await tx.ticket.createMany({ data: rows });
    }

    if (current.promoCodeId) {
      await tx.promoCode.update({ where: { id: current.promoCodeId }, data: { uses: { increment: 1 } } });
    }

    return tx.order.findUniqueOrThrow({
      where: { id: current.id },
      include: { tickets: { include: { tier: true } }, event: true },
    });
  });

  if (!order) return { settled: false };

  emitToOrganiser(order.event.organiserId, {
    type: "order",
    eventSlug: order.event.slug,
    orderId: order.id,
    totalCents: order.totalCents,
    tickets: order.tickets.length,
    at: new Date().toISOString(),
  });

  void deliverTickets(order).catch((err) => logger.warn({ err }, "ticket delivery failed"));

  return { settled: true };
}

/** Render the PDF and email it. Never throws: the order is already paid, and
 * a mail or render failure must not undo that. */
async function deliverTickets(order: SettledOrder): Promise<void> {
  const input = buildEmailInput(order);
  let attachments;
  try {
    const pdf = await renderTicketsPdf(
      order.tickets.map((ticket) => ({
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
      })),
    );
    attachments = [{ filename: `eventick-${order.id}.pdf`, content: pdf }];
  } catch (err) {
    // Still send the confirmation without the attachment rather than nothing.
    logger.warn({ err, orderId: order.id }, "ticket PDF render failed — sending email without attachment");
  }

  await sendEmail({
    to: order.email,
    subject: orderConfirmationSubject(input),
    html: orderConfirmationHtml(input),
    attachments,
  });
}

type SettledOrder = Order & {
  tickets: (Ticket & { tier: TicketTier })[];
  event: Event;
};

function buildEmailInput(order: SettledOrder) {
  return {
    locale: "fr" as const,
    holderName: order.holderName,
    eventTitle: order.event.titleFr,
    eventCity: order.event.city,
    eventStart: order.event.startAt,
    orderId: order.id,
    totalCents: order.totalCents,
    tickets: order.tickets.map((ticket) => ({
      ref: ticket.ref,
      tierName: ticket.tier.nameFr,
      holderName: ticket.holderName,
      priceCents: ticket.tier.priceCents,
    })),
  };
}
