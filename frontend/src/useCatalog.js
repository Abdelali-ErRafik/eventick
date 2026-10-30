/**
 * Catalog helpers.
 *
 * `useCatalog` itself now lives in CatalogContext.jsx and is re-exported here
 * so the five existing import sites keep working. It used to be a bare
 * useState+useEffect in this file, which meant every caller mounted its own
 * fetch — `Shell` plus whichever screen it wrapped, so twice per page.
 */
export { useCatalog } from "./CatalogContext.jsx";

/*
 * eventTitle/eventVenue/eventBlurb used to live here and had NO callers —
 * every screen wrote the locale conditional inline instead, fifty-two times.
 * A per-field wrapper that nobody reaches for is worse than none, so they are
 * gone: `eventText(row, field, locale)` in utils.js is the one way to read
 * organiser-written text, and it works for tier names, zones and gates too,
 * which these three never covered.
 */
