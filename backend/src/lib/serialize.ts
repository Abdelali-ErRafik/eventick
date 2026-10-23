import type { Event, LineupItem, Order, Ticket, TicketTier } from "@prisma/client";

export type EventWithTiers = Event & { tiers: TicketTier[]; lineup: LineupItem[] };

/** Shapes a DB event back into the bilingual catalog JSON the frontend
 * already knows how to render (ported field-for-field from the original
 * EventItem/Tier types in src/lib/catalog.ts). */
export function publicEvent(event: EventWithTiers, remainingByTier: Record<string, number>) {
  return {
    slug: event.slug,
    titleFr: event.titleFr,
    titleAr: event.titleAr,
    category: event.category,
    city: event.city,
    venueFr: event.venueFr,
    venueAr: event.venueAr,
    address: event.address,
    start: event.startAt.toISOString(),
    end: event.endAt.toISOString(),
    doors: event.doorsAt.toISOString(),
    image: event.image,
    badge: event.badge,
    blurbFr: event.blurbFr,
    blurbAr: event.blurbAr,
    aboutFr: event.aboutFr,
    aboutAr: event.aboutAr,
    ageFr: event.ageFr,
    ageAr: event.ageAr,
    popularity: event.popularity,
    instant: event.instant,
    tiers: event.tiers.map((tier) => ({
      id: tier.id,
      nameFr: tier.nameFr,
      nameAr: tier.nameAr,
      blurbFr: tier.blurbFr,
      blurbAr: tier.blurbAr,
      priceCents: tier.priceCents,
      capacity: tier.capacity,
      remaining: remainingByTier[tier.id] ?? 0,
      numbered: tier.numbered,
      recommended: tier.recommended,
      saveCents: tier.saveCents,
      zoneFr: tier.zoneFr,
      zoneAr: tier.zoneAr,
      gateFr: tier.gateFr,
      gateAr: tier.gateAr,
    })),
    lineup: event.lineup.map((item) => ({
      day: item.day.toISOString(),
      time: item.time,
      name: item.name,
      genreFr: item.genreFr,
      genreAr: item.genreAr,
      image: item.image,
    })),
  };
}

export function publicOrder(order: Order & { tickets: Ticket[] }) {
  return {
    id: order.id,
    status: order.status,
    holderName: order.holderName,
    email: order.email,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    totalCents: order.totalCents,
    paymentRef: order.paymentRef,
    createdAt: order.createdAt.toISOString(),
    tickets: order.tickets.map(publicTicket),
  };
}

export function publicTicket(ticket: Ticket) {
  return {
    id: ticket.id,
    ref: ticket.ref,
    status: ticket.status,
    holderName: ticket.holderName,
    seatRow: ticket.seatRow,
    seatNumber: ticket.seatNumber,
  };
}
