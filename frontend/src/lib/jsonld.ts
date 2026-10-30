import type { CatalogEvent } from "./catalog-server";
import { siteUrl } from "./catalog-server";

/**
 * schema.org JSON-LD for the public pages.
 *
 * The hard rule, and the reason `eventJsonLd` can return null: markup may
 * only describe an event somebody can actually book. Google treats
 * structured data for unbookable or invented events as spam, and the penalty
 * lands on the whole domain, not the one page. So this is gated on
 * `seoIndexable`, a column that exists purely to answer that question —
 * default false, set deliberately per event.
 *
 * Note what is NOT used as the gate: `organiserId`. The seed assigns an
 * organiser to every event, so a null check there would classify all the
 * demo rows as genuine and publish fabricated prices as real inventory.
 */

/** The site itself. Factual, claims nothing about any event. */
export function siteJsonLd() {
  const site = siteUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${site}/#website`,
        url: site,
        name: "Eventick",
        inLanguage: "fr-MA",
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${site}/explorer?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": `${site}/#organization`,
        name: "Eventick",
        url: site,
        areaServed: { "@type": "Country", name: "Maroc" },
      },
    ],
  };
}

/**
 * One event, or null when it must not be marked up.
 *
 * Returns null for demo data (`seoIndexable` false) and for a cancelled
 * event — an event that is not happening is not an offer.
 */
export function eventJsonLd(event: CatalogEvent) {
  if (!event.seoIndexable) return null;
  if (event.cancelledAt) return null;

  const site = siteUrl();
  const url = `${site}/evenements/${event.slug}`;

  // One Offer per tier. `remaining` decides availability, so a sold-out tier
  // says SoldOut rather than quietly claiming stock it does not have.
  const offers = event.tiers.map((tier) => ({
    "@type": "Offer",
    name: tier.nameFr,
    url,
    price: (tier.priceCents / 100).toFixed(2),
    priceCurrency: "MAD",
    availability: tier.remaining > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
    // Omitted rather than guessed when the tier has no window: validFrom is
    // a promise about when the offer opens.
    ...(tier.salesStartAt ? { validFrom: tier.salesStartAt } : {}),
    ...(tier.salesEndAt ? { validThrough: tier.salesEndAt } : {}),
  }));

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.titleFr,
    url,
    startDate: event.start,
    endDate: event.end,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    description: (event.blurbFr || event.aboutFr || "").trim() || undefined,
    image: event.image ? [`${site}${event.image}`] : undefined,
    location: {
      "@type": "Place",
      name: event.venueFr,
      address: {
        "@type": "PostalAddress",
        streetAddress: event.address,
        addressLocality: event.city,
        addressCountry: "MA",
      },
    },
    offers: offers.length > 0 ? offers : undefined,
  };
}
