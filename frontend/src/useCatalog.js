/**
 * Catalog helpers.
 *
 * `useCatalog` itself now lives in CatalogContext.jsx and is re-exported here
 * so the five existing import sites keep working. It used to be a bare
 * useState+useEffect in this file, which meant every caller mounted its own
 * fetch — `Shell` plus whichever screen it wrapped, so twice per page.
 */
export { useCatalog } from "./CatalogContext.jsx";

export function eventTitle(event, locale) {
  return locale === "ar" ? event.titleAr : event.titleFr;
}

export function eventVenue(event, locale) {
  return locale === "ar" ? event.venueAr : event.venueFr;
}

export function eventBlurb(event, locale) {
  return locale === "ar" ? event.blurbAr : event.blurbFr;
}
