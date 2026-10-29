-- Stripe is gone; CMI is the gateway.
--
-- `payment_intent_id` held a Stripe PaymentIntent id. CMI's equivalent is its
-- `TransId`, so the column is RENAMED rather than dropped and re-added: a
-- rename keeps the rows (and the unique index that stops a replayed callback
-- settling the same payment twice), where a drop would throw away the payment
-- reference of every order already placed.
ALTER TABLE "orders" RENAME COLUMN "payment_intent_id" TO "gateway_ref";
ALTER INDEX "orders_payment_intent_id_key" RENAME TO "orders_gateway_ref_key";

-- Which order is currently trying to buy a listing.
--
-- Stripe carried the listing id in PaymentIntent metadata. CMI echoes back
-- only our order reference, so the link has to live here or the callback
-- cannot tell a resold seat from fresh inventory.
ALTER TABLE "resale_listings" ADD COLUMN "pending_order_id" TEXT;
CREATE UNIQUE INDEX "resale_listings_pending_order_id_key" ON "resale_listings"("pending_order_id");
