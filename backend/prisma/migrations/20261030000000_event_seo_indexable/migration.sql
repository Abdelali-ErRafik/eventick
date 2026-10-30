-- Does this event describe something a buyer can really book?
--
-- Gates schema.org Event markup, and nothing else. Defaults to FALSE so a
-- new event is never marked up until someone confirms it is real: Google
-- treats structured data for unbookable events as spam, and penalises the
-- domain rather than the page.
--
-- Not derivable from organiser_id. The seed assigns an organiser to every
-- event, so that column marks all the demo rows as genuine.
ALTER TABLE "events" ADD COLUMN "seo_indexable" BOOLEAN NOT NULL DEFAULT false;
