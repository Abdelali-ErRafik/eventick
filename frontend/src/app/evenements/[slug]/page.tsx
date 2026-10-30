import type { Metadata } from "next";
import SpaMount from "../../[[...slug]]/SpaMount";
import { getEvent, type CatalogEvent } from "../../../lib/catalog-server";
import { eventJsonLd } from "../../../lib/jsonld";

/**
 * An event page — the same SPA screen as before, with a real head.
 *
 * This route exists ONLY to put a correct title, description and canonical
 * on the site's most valuable URLs. Every event page previously served the
 * site-wide title, so sixteen events looked like sixteen copies of one page.
 *
 * It renders exactly the same `<SpaMount />` as the catch-all does, so the
 * visible page, the react-router route and EventDetail are untouched. A
 * concrete route segment takes precedence over the optional catch-all at
 * app/[[...slug]], which is what lets this own the head without owning the
 * rendering.
 */

/** "2027-06-19T21:00:00.000Z" -> "19 juin 2027", in French for the FR head. */
function frenchDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-MA", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** A search snippet: whole sentences, trimmed near 155 characters. */
function snippet(event: CatalogEvent): string {
  const date = frenchDate(event.start);
  const lead = `${event.titleFr} — ${event.venueFr}, ${event.city}${date ? `, le ${date}` : ""}.`;
  const body = (event.blurbFr || event.aboutFr || "").trim();
  const full = body ? `${lead} ${body}` : `${lead} Billets en vente sur Eventick, e-billet immédiat avec QR code.`;
  if (full.length <= 155) return full;
  const cut = full.slice(0, 152);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : 152)}…`;
}

export async function generateMetadata({
  params,
}: {
  // Next 16 hands params in as a Promise — it must be awaited.
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEvent(slug);

  // Unknown slug, or the backend is unreachable. Falling back to the
  // site-wide title is correct: better a generic head than a failed render
  // on the pages that matter most.
  if (!event) return {};

  const date = frenchDate(event.start);
  const title = `${event.titleFr} · ${event.city}${date ? ` · ${date}` : ""}`;

  return {
    title,
    description: snippet(event),
    alternates: { canonical: `/evenements/${event.slug}` },
    // A cancelled event should stop being a search result. The page still
    // works for anyone holding the link — it just stops being advertised.
    robots: event.cancelledAt ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website",
      title,
      description: snippet(event),
      url: `/evenements/${event.slug}`,
      images: event.image ? [{ url: event.image }] : undefined,
    },
  };
}

/**
 * The body: the SPA, plus the event's schema.org markup when it is allowed.
 *
 * `EventJsonLd` is a separate SYNCHRONOUS component on purpose. SpaMount
 * loads ClientApp with `ssr: false`, which bails its Suspense boundary out
 * to client rendering, and an ASYNC sibling's output is discarded when that
 * happens — a <script> returned from an async page component reached the
 * browser zero times. The catch-all route renders the same sibling shape
 * synchronously and its markup survives, which is the pattern copied here:
 * the async work (the fetch) happens inside the child, not in the page.
 */
export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEvent(slug);
  // Null for demo data and for a cancelled event, so nothing is emitted
  // unless the event is genuinely bookable.
  //
  // Note for anyone debugging why markup does not appear after flipping
  // seoIndexable in the database: generateMetadata and this component each
  // hold their OWN cached copy of the fetch (revalidate 300), so the head
  // can update while the body still reads the old value. Restart the dev
  // server, or wait out the window.
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
