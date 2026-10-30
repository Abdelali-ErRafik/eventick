import { getEvents, type CatalogEvent } from "./catalog-server";

/**
 * City and category landing pages — but only the ones that earn a page.
 *
 * The review asked for indexable pages per city and per main category,
 * rather than relying on `?ville=`/`?cat=` querystrings that no crawler
 * treats as distinct content. The trap is doing it exhaustively: with the
 * current catalogue, 8 cities x 6 categories would mint pages holding one
 * event or none, which is a doorway-page pattern — it spends crawl budget
 * and invites a quality problem rather than earning traffic.
 *
 * So a page exists only while it lists at least MIN_EVENTS sellable events.
 * Measured against the live catalogue, that is 3 of 7 cities and 4 of 6
 * categories — real pages with real lists, and the rest appear by
 * themselves as the catalogue grows. Nothing to remember to turn on.
 */

/** Below this, a landing page has too little on it to deserve indexing. */
export const MIN_EVENTS = 2;

/** "Fès" -> "fes". City names carry accents; URLs should not. */
export function citySlug(city: string): string {
  return city
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Only events a buyer could actually act on. */
export function sellable(events: CatalogEvent[], now = new Date()): CatalogEvent[] {
  return events.filter((event) => {
    if (event.cancelledAt) return false;
    // `end`, not `start`: a festival that began yesterday is still sellable.
    return new Date(event.end) >= now;
  });
}

export interface Landing {
  /** The URL segment. */
  slug: string;
  /** The real value to match events on (the city name, or the category id). */
  value: string;
  events: CatalogEvent[];
}

/** Cities with enough sellable events to warrant their own page. */
export async function cityLandings(now = new Date()): Promise<Landing[]> {
  const live = sellable(await getEvents(), now);
  const byCity = new Map<string, CatalogEvent[]>();
  for (const event of live) {
    const list = byCity.get(event.city) ?? [];
    list.push(event);
    byCity.set(event.city, list);
  }
  return [...byCity.entries()]
    .filter(([, list]) => list.length >= MIN_EVENTS)
    .map(([city, events]) => ({ slug: citySlug(city), value: city, events }))
    .sort((a, b) => b.events.length - a.events.length);
}

/** Categories with enough sellable events to warrant their own page. */
export async function categoryLandings(now = new Date()): Promise<Landing[]> {
  const live = sellable(await getEvents(), now);
  const byCat = new Map<string, CatalogEvent[]>();
  for (const event of live) {
    const list = byCat.get(event.category) ?? [];
    list.push(event);
    byCat.set(event.category, list);
  }
  return [...byCat.entries()]
    .filter(([, list]) => list.length >= MIN_EVENTS)
    .map(([category, events]) => ({ slug: category, value: category, events }))
    .sort((a, b) => b.events.length - a.events.length);
}

/** One city's page, or null when it does not qualify. */
export async function cityLanding(slug: string, now = new Date()): Promise<Landing | null> {
  return (await cityLandings(now)).find((l) => l.slug === slug) ?? null;
}

/** One category's page, or null when it does not qualify. */
export async function categoryLanding(slug: string, now = new Date()): Promise<Landing | null> {
  return (await categoryLandings(now)).find((l) => l.slug === slug) ?? null;
}

/** French labels for the six categories, for titles and headings. */
export const CATEGORY_LABEL_FR: Record<string, string> = {
  festivals: "Festivals de musique",
  humour: "Théâtre & humour",
  sport: "Sport & événements",
  nightlife: "Soirées & clubbing",
  culture: "Culture & gastronomie",
  salons: "Salons & conférences",
};
