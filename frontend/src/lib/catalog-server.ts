/**
 * Reading the catalogue from the SERVER, for metadata and the sitemap.
 *
 * `src/api.js` cannot be used here. It calls `fetch("/api" + path)` — a
 * relative URL, which only resolves in a browser — and the `/api/:path*`
 * rewrite in next.config.ts applies to requests arriving at Next, not to
 * fetches Next itself makes. So server code has to talk to Express directly.
 *
 * Every function here fails soft and returns null or an empty list. These
 * feed page titles and the sitemap: if the backend is briefly down, the
 * right outcome is a generic title, not a 500 on the most valuable pages on
 * the site.
 */

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:4100";

/** How long a crawl-facing read may be cached. Catalogues move slowly. */
const REVALIDATE = 300;

/** One ticket tier, as the public API serialises it. */
export interface CatalogTier {
  id: string;
  nameFr: string;
  nameAr: string;
  priceCents: number;
  capacity: number;
  remaining: number;
  salesStartAt: string | null;
  salesEndAt: string | null;
}

/** One event, as GET /api/events[/:slug] returns it. */
export interface CatalogEvent {
  slug: string;
  titleFr: string;
  titleAr: string;
  category: string;
  city: string;
  venueFr: string;
  venueAr: string;
  address: string;
  start: string;
  end: string;
  doors: string;
  image: string;
  blurbFr: string;
  blurbAr: string;
  aboutFr: string;
  aboutAr: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  maxPerBuyer: number;
  allowResale: boolean;
  tiers: CatalogTier[];
}

async function read<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND}/api${path}`, {
      next: { revalidate: REVALIDATE },
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // Backend unreachable. The caller substitutes a sensible default.
    return null;
  }
}

/** Every publicly visible event. Empty list if the backend cannot be read. */
export async function getEvents(): Promise<CatalogEvent[]> {
  const data = await read<{ events: CatalogEvent[] }>("/events");
  return data?.events ?? [];
}

/** One event by slug, or null when it does not exist or cannot be read. */
export async function getEvent(slug: string): Promise<CatalogEvent | null> {
  const data = await read<{ event: CatalogEvent }>(`/events/${encodeURIComponent(slug)}`);
  return data?.event ?? null;
}

/**
 * The site's own origin, used for canonicals, og:url and the sitemap.
 *
 * This is the single most consequential setting in the SEO work: left at the
 * localhost default in production, every canonical and every sitemap entry
 * would advertise localhost, and the site would look finished while being
 * worse than it was before. Set NEXT_PUBLIC_SITE_URL per environment.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100").replace(/\/+$/, "");
}

/**
 * Routes that must never be indexed.
 *
 * Two different reasons, both real. Most are app surfaces with nothing to
 * rank — a checkout page, the dashboard. But `/billet-offert/:token` carries
 * a gift-ticket credential IN THE URL PATH: letting a crawler walk those is
 * a privacy problem before it is an SEO one, and today nothing stops it
 * because robots.txt is served as HTML by the SPA catch-all.
 */
export const PRIVATE_PATHS = [
  "/pro/",
  "/paiement",
  "/billets",
  "/billet/",
  "/billet-offert/",
  "/confirmation/",
  "/login",
  "/organiser",
  "/devenir-organisateur",
];
