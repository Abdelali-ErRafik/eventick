import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SpaMount from "../../../[[...slug]]/SpaMount";
import { getEvent, type CatalogEvent } from "../../../../lib/catalog-server";
import { eventJsonLd } from "../../../../lib/jsonld";
import {
  INDEXABLE_LOCALES,
  isIndexableLocale,
  localeAlternatesFor,
  type IndexableLocale,
} from "../../../../lib/locales";

/**
 * An event page in one locale.
 *
 * This is where the prefixed URLs earn their keep. `/ar/evenements/<slug>`
 * is not a translated wrapper around a French page — the title, description
 * and Open Graph text are built from the event's own Arabic columns, so the
 * Arabic result in Google reads as Arabic before anyone clicks it.
 *
 * That is also why /en/ is not a route (see lib/locales.ts): there are no
 * English event columns, so an English URL would have nothing truer to say
 * than the French text, under an hreflang promising otherwise.
 */

export function generateStaticParams() {
  return INDEXABLE_LOCALES.map((locale) => ({ locale }));
}

/** Per-locale date formatting, in that locale's own calendar conventions. */
function localDate(iso: string, locale: IndexableLocale): string {
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-MA" : "fr-MA", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** The event's own words in this locale, falling back only when empty. */
function localised(event: CatalogEvent, locale: IndexableLocale) {
  if (locale === "ar") {
    return {
      title: event.titleAr || event.titleFr,
      venue: event.venueAr || event.venueFr,
      body: (event.blurbAr || event.aboutAr || "").trim(),
    };
  }
  return {
    title: event.titleFr,
    venue: event.venueFr,
    body: (event.blurbFr || event.aboutFr || "").trim(),
  };
}

/** A search snippet: whole sentences, trimmed near 155 characters. */
function snippet(event: CatalogEvent, locale: IndexableLocale): string {
  const { title, venue, body } = localised(event, locale);
  const date = localDate(event.start, locale);
  const lead =
    locale === "ar"
      ? `${title} — ${venue}، ${event.city}${date ? `، ${date}` : ""}.`
      : `${title} — ${venue}, ${event.city}${date ? `, le ${date}` : ""}.`;
  const tail =
    locale === "ar"
      ? "التذاكر متاحة على Eventick، تذكرة إلكترونية فورية برمز QR."
      : "Billets en vente sur Eventick, e-billet immédiat avec QR code.";
  const full = body ? `${lead} ${body}` : `${lead} ${tail}`;
  if (full.length <= 155) return full;
  const cut = full.slice(0, 152);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : 152)}…`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isIndexableLocale(locale)) return {};

  const event = await getEvent(slug);
  // Unknown slug, or the backend is unreachable: a generic head beats a
  // failed render on the pages that matter most.
  if (!event) return { alternates: localeAlternatesFor(locale, `/evenements/${slug}`) };

  const { title: name } = localised(event, locale);
  const date = localDate(event.start, locale);
  const title = `${name} · ${event.city}${date ? ` · ${date}` : ""}`;
  const description = snippet(event, locale);

  return {
    title,
    description,
    alternates: localeAlternatesFor(locale, `/evenements/${event.slug}`),
    // A cancelled event should stop being a search result. The page still
    // works for anyone holding the link — it just stops being advertised.
    robots: event.cancelledAt ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website",
      title,
      description,
      url: `/${locale}/evenements/${event.slug}`,
      locale: locale === "ar" ? "ar_MA" : "fr_MA",
      images: event.image ? [{ url: event.image }] : undefined,
    },
  };
}

/**
 * The body: the SPA, plus the event's schema.org markup when it is allowed.
 *
 * `EventJsonLd` stays a synchronous sibling for the reason the unprefixed
 * route documents: SpaMount loads ClientApp with `ssr: false`, which bails
 * its Suspense boundary out to client rendering, and an async sibling's
 * output is discarded when that happens.
 */
export default async function LocalisedEventPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isIndexableLocale(locale)) notFound();

  const event = await getEvent(slug);
  // Null for demo data and for a cancelled event, so nothing is emitted
  // unless the event is genuinely bookable.
  const jsonLd = event ? eventJsonLd(event) : null;

  return (
    <>
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      ) : null}
      <SpaMount />
    </>
  );
}
