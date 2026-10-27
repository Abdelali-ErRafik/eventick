-- Stripe PaymentIntent id. UNIQUE so a replayed webhook can never settle twice.
ALTER TABLE "orders" ADD COLUMN "payment_intent_id" TEXT;
CREATE UNIQUE INDEX "orders_payment_intent_id_key" ON "orders"("payment_intent_id");
