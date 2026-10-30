import type { CatalogEvent } from "../../lib/catalog-server";

/**
 * The shared body of a city or category landing page.
 *
 * Server-rendered on purpose, and the only place in this app that is. The
 * rest of the site is a client-only SPA, which means a crawler fetching any
 * URL gets an empty shell — fine for pages reached by a human who already
 * knows the site, useless for a page whose whole job is to rank for
 * "concerts à Casablanca". So these pages render their list as real HTML.
 *
 * It deliberately does NOT reimplement the SPA's filtering, sorting or
 * cards. It lists what it has, in plain markup, and links into /explorer
 * for anything interactive. Two parallel implementations of the catalogue
 * would drift, and the second one would be the one nobody tests.
 */

const money = (cents: number) =>
  new Intl.NumberFormat("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);

const longDate = (iso: string) => {
  try {
    return new Intl.DateTimeFormat("fr-MA", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return "";
  }
};

/** The cheapest tier still on sale — what a listing should quote. */
function fromPrice(event: CatalogEvent): number | null {
  const live = event.tiers.filter((t) => t.remaining > 0);
  const pool = live.length > 0 ? live : event.tiers;
  if (pool.length === 0) return null;
  return Math.min(...pool.map((t) => t.priceCents));
}

export function LandingPage({
  heading,
  intro,
  events,
  exploreHref,
}: {
  heading: string;
  intro: string;
  events: CatalogEvent[];
  exploreHref: string;
}) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-14">
      <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">{heading}</h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">{intro}</p>

      <p className="mt-6">
        <a
          href={exploreHref}
          className="inline-flex h-11 items-center rounded-full bg-action px-5 text-sm font-semibold text-action-fg transition hover:bg-action-hover"
        >
          Filtrer et comparer les {events.length} dates
        </a>
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {events.map((event) => {
          const price = fromPrice(event);
          return (
            <li key={event.slug} className="rounded-card border border-line/10 bg-card p-5 shadow-card">
              <h2 className="font-display text-lg font-bold leading-snug">
                <a href={`/evenements/${event.slug}`} className="hover:text-primary">
                  {event.titleFr}
                </a>
              </h2>
              <p className="mt-1.5 text-sm text-muted">
                {event.venueFr}, {event.city}
              </p>
              <p className="mt-0.5 text-sm text-muted">{longDate(event.start)}</p>
              {price !== null ? (
                <p className="mt-3 text-sm font-bold tabular-nums">
                  à partir de {money(price)} <span className="text-xs font-semibold text-muted">MAD</span>
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="mt-10 text-sm text-muted">
        <a href="/explorer" className="font-semibold text-primary hover:underline">
          Voir tous les événements au Maroc
        </a>
      </p>
    </main>
  );
}
