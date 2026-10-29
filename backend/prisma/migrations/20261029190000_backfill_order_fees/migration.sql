-- Price every settled order ONCE, so no fee is ever recomputed on read.
--
-- Orders settled before commission existed carry fee_cents NULL, and the
-- finance routes priced those on the fly from the organiser's CURRENT plan.
-- That reintroduced exactly the instability the stored fee exists to remove:
-- reassign an organiser and their reported commission on historical sales
-- moved with it. Caught by the live suite — "a plan change does not move the
-- REPORTED fee" failed with 240.00 -> 260.00 against 18 unpriced orders.
--
-- Backfilling at the organiser's CURRENT plan is a guess, and the only one
-- available: nobody recorded which plan they were on at the time, because
-- plans did not exist. What matters is that the guess is made once and then
-- frozen, rather than re-made on every page load.

UPDATE "orders" AS o
SET
    "fee_cents" = ROUND(o."total_cents" * p."rate_bps" / 10000.0),
    "fee_plan_key" = p."key"
FROM "events" AS e
JOIN "users" AS u ON u."id" = e."organiser_id"
-- The organiser's own plan, falling back to the platform default for an
-- organiser who has never been assigned one. COALESCE on the join rather than
-- two passes, so an unassigned organiser is not left NULL.
JOIN "plans" AS p
    ON p."key" = COALESCE(u."plan_id", (SELECT "key" FROM "plans" WHERE "is_default" = true LIMIT 1))
WHERE
    o."event_id" = e."id"
    AND o."fee_cents" IS NULL
    AND o."status" IN ('PAID', 'REFUNDED')
    -- A platform-owned event has no organiser to charge.
    AND e."organiser_id" IS NOT NULL;
