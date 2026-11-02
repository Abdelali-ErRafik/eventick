/**
 * The locales that get their own indexable URL.
 *
 * French and Arabic only, and that is a content decision rather than a
 * technical one: every event carries real `titleAr`, `venueAr` and `aboutAr`
 * copy, so `/fr/` and `/ar/` are genuine alternates of each other. There are
 * no English event columns, so an indexable `/en/` would serve French text
 * under an hreflang promising English — which is worse for a searcher than
 * having no English URL at all, and is the kind of thing Google treats as a
 * quality problem rather than a missing translation.
 *
 * English stays available in the app: the account menu still switches the
 * interface, it simply has no crawlable URL of its own. Add "en" here in the
 * same change that adds English event copy, not before.
 */
export const INDEXABLE_LOCALES = ["fr", "ar"] as const;

export type IndexableLocale = (typeof INDEXABLE_LOCALES)[number];

/** The locale served when a URL carries no prefix. */
export const DEFAULT_LOCALE: IndexableLocale = "fr";

export function isIndexableLocale(value: string): value is IndexableLocale {
  return (INDEXABLE_LOCALES as readonly string[]).includes(value);
}

/**
 * The BCP-47 tag for an hreflang attribute.
 *
 * Regional ("fr-MA", "ar-MA") rather than bare, because this is a Moroccan
 * ticketing site: a searcher in Paris and a searcher in Casablanca want
 * different results, and the region is the part that says so.
 */
export const HREFLANG: Record<IndexableLocale, string> = {
  fr: "fr-MA",
  ar: "ar-MA",
};

/** Right-to-left locales, for the `dir` attribute on <html>. */
export function dirFor(locale: IndexableLocale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * The `alternates` block for a page that exists in every indexable locale.
 *
 * `path` is the locale-independent part, with a leading slash and no prefix
 * — "/" for the home page, "/evenements/mawazine-2027" for an event.
 *
 * x-default points at the unprefixed URL, which is what an existing link or
 * a bookmark already uses. Pointing it at /fr/ instead would quietly demote
 * every link earned so far.
 */
export function localeAlternates(path: string): {
  canonical: string;
  languages: Record<string, string>;
} {
  const clean = path === "/" ? "" : path.replace(/\/+$/, "");
  const languages: Record<string, string> = { "x-default": clean || "/" };
  for (const locale of INDEXABLE_LOCALES) {
    languages[HREFLANG[locale]] = `/${locale}${clean}`;
  }
  return { canonical: clean || "/", languages };
}

/**
 * The same block, for a page already being served under a prefix.
 *
 * The canonical is the prefixed URL itself — `/ar/evenements/x` is its own
 * canonical, not a duplicate of the French one. Saying otherwise would tell
 * Google the Arabic page is a copy and should not be indexed, which is the
 * opposite of what these routes are for.
 */
export function localeAlternatesFor(
  locale: IndexableLocale,
  path: string,
): { canonical: string; languages: Record<string, string> } {
  const { languages } = localeAlternates(path);
  const clean = path === "/" ? "" : path.replace(/\/+$/, "");
  return { canonical: `/${locale}${clean}` || "/", languages };
}
