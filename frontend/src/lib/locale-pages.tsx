import type { Metadata } from "next";
import SpaMount from "../app/[[...slug]]/SpaMount";
import { getEvent, type CatalogEvent } from "./catalog-server";
import { eventJsonLd, siteJsonLd } from "./jsonld";
import { localeAlternatesFor, type IndexableLocale } from "./locales";

/**
 * The shared body of every locale-prefixed route.
 *
 * `/fr/` and `/ar/` are CONCRETE directories rather than one `[locale]`
 * segment, and that is not a style choice. A dynamic segment sits at the same
 * level as the optional catch-all at `app/[[...slug]]`, and Next gives the
 * dynamic segment priority — so `/explorer` matched `[locale]` with
 * locale="explorer", hit the "unknown locale" branch and 404'd. Every
 * unprefixed SPA path broke that way: /explorer, /aide, /legal, /billets.
 *
 * Concrete segments do not compete with the catch-all: `/fr` matches the
 * folder, `/explorer` falls through to `[[...slug]]` as before. The cost is
 * two thin directories per route shape, which is why the actual work lives
 * here and each page is a three-line call.
 */

/** Per-locale date formatting, in that locale's own conventions. */
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

/** Head for any non-event page served under a prefix. */
export async function localeMetadata(
  locale: IndexableLocale,
  slug?: string[],
): Promise<Metadata> {
  const path = slug?.length ? `/${slug.join("/")}` : "/";
  return { alternates: localeAlternatesFor(locale, path) };
}

/** Head for a prefixed event page — the locale's own title and description. */
export async function localeEventMetadata(
  locale: IndexableLocale,
  slug: string,
): Promise<Metadata> {
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

/** Body for any non-event page served under a prefix. */
export function LocalePage() {
  return (
    <>
      {/* WebSite + Organization only — factual, and claims nothing about any
          individual event. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd()) }} />
      <SpaMount />
    </>
  );
}

/**
 * Body for a prefixed event page.
 *
 * The JSON-LD stays a synchronous sibling for the reason the unprefixed route
 * documents: SpaMount loads ClientApp with `ssr: false`, which bails its
 * Suspense boundary out to client rendering, and an async sibling's output is
 * discarded when that happens.
 */
export async function LocaleEventPage({ slug }: { slug: string }) {
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
