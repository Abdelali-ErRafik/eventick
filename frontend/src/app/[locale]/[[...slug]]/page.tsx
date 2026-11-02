import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SpaMount from "../../[[...slug]]/SpaMount";
import { siteJsonLd } from "../../../lib/jsonld";
import { INDEXABLE_LOCALES, isIndexableLocale, localeAlternatesFor } from "../../../lib/locales";

/**
 * Every SPA page, served under a locale prefix.
 *
 * This is the same `<SpaMount />` the unprefixed catch-all renders — the
 * visible page, the react-router routes and every screen are untouched. What
 * the prefix adds is a head: a canonical that points at the prefixed URL
 * itself, and hreflang links naming the other locale.
 *
 * Both halves are needed for the pair to work. Without the canonical, Google
 * is free to treat /ar/ as a duplicate of / and drop it. Without hreflang,
 * the two pages compete rather than describe each other.
 *
 * `generateStaticParams` is deliberately NOT exhaustive over paths: the
 * locale segment is enumerated, the rest stays dynamic, because the catalogue
 * changes and a stale prerendered list of slugs is worse than rendering on
 * demand.
 */

export function generateStaticParams() {
  return INDEXABLE_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug?: string[] }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isIndexableLocale(locale)) return {};

  const path = slug?.length ? `/${slug.join("/")}` : "/";
  return { alternates: localeAlternatesFor(locale, path) };
}

export default async function LocalisedCatchAll({
  params,
}: {
  params: Promise<{ locale: string; slug?: string[] }>;
}) {
  const { locale } = await params;

  // An unknown prefix is a genuine 404, not a silent fallback to French.
  // "/de/explorer" has never been advertised, so answering it with content
  // would invent a URL that hreflang does not mention and that nothing links
  // to — exactly the kind of near-duplicate these routes exist to avoid.
  if (!isIndexableLocale(locale)) notFound();

  return (
    <>
      {/* WebSite + Organization only — factual, and claims nothing about any
          individual event. Event markup lives on the event route, gated on
          whether that event is really bookable. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd()) }} />
      <SpaMount />
    </>
  );
}
