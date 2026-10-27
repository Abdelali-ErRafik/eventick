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
 * Settlement — the one place a successful payment turns into tickets.
 *
 * Both paths funnel through here so they can never drift: the Stripe webhook
 * (real mode) and the direct confirm (mock mode). IDEMPOTENT by necessity —
 * Stripe retries deliveries and can reorder them, so applying the same outcome
 * twice must be a no-op rather than minting a second set of tickets.
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
