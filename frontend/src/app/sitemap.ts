import type { MetadataRoute } from "next";
import { getEvents, siteUrl } from "../lib/catalog-server";
import { categoryLandings, cityLandings } from "../lib/landing";

/**
 * sitemap.xml — same story as robots.txt: the path returned the SPA's HTML
 * shell, so there was no sitemap at all.
 *
 * Only pages worth a crawler's time are listed: the home page, the explorer,
 * and one entry per event that is still sellable. A cancelled or finished
 * event is deliberately left out — pointing a crawler at a page that cannot
 * be bought spends crawl budget to produce a disappointment.
 *
 * Deliberately NOT listed: the `?cat=` / `?ville=` filter querystrings. They
 * are client-side filters over the same list, so indexing them would create
 * near-duplicate thin pages. The real city and category pages at
 * /billets-ville/* and /billets-categorie/* are listed instead — and only
 * the ones that qualify, since lib/landing.ts refuses to build a page for a
 * city or category with too few events to be worth a crawl.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = siteUrl();
  const events = await getEvents();
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${site}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${site}/explorer`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${site}/aide`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${site}/legal`, lastModified: now, changeFrequency: "yearly", priority: 0.1 },
  ];

  const sellable = events.filter((event) => {
    if (event.cancelledAt) return false;
    // `end` rather than `start`: a festival that began yesterday and runs all
    // week is still worth indexing.
    return new Date(event.end) >= now;
  });

  const eventPages: MetadataRoute.Sitemap = sellable.map((event) => ({
    url: `${site}/evenements/${event.slug}`,
    // The event's own end date is the most honest "last meaningful change"
    // signal available without a per-row updatedAt in the public payload.
    lastModified: new Date(event.end),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Landing pages, listed only while they qualify. A city that drops below
  // the threshold leaves the sitemap on the next revalidation rather than
  // advertising a page that now 404s.
  const [cities, categories] = await Promise.all([cityLandings(now), categoryLandings(now)]);

  const landingPages: MetadataRoute.Sitemap = [
    ...cities.map((l) => ({
      url: `${site}/billets-ville/${l.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...categories.map((l) => ({
      url: `${site}/billets-categorie/${l.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];

  return [...staticPages, ...eventPages, ...landingPages];
}
