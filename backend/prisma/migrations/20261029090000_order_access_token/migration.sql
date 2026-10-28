-- Guest orders need proof of purchase that is not the order id.
--
-- A guest order has no customer_id, so there is no user to authorise a
-- request against. The id could not stand in for one: cuid() embeds a
-- timestamp and a counter, so ids are partially sequential and were never
-- meant to be secret. This column is the secret.

ALTER TABLE "orders" ADD COLUMN "access_token" TEXT;

-- Backfill every existing order, so no confirmation link or QR page that is
-- already in someone's inbox stops working. Two gen_random_uuid() values
-- (built in since PG13, no pgcrypto needed) give 256 bits of entropy; the
-- dashes are stripped so the value is URL-clean.
UPDATE "orders"
SET "access_token" = replace(gen_random_uuid()::text, '-', '')
                  || replace(gen_random_uuid()::text, '-', '')
WHERE "access_token" IS NULL;

-- Unique, because the token is looked up on its own to find the order.
CREATE UNIQUE INDEX "orders_access_token_key" ON "orders"("access_token");
