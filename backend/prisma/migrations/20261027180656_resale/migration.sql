-- Resale: platform-mediated, face value. The buyer pays Eventick, the seller
-- is refunded, and a fresh ticket replaces the voided original.
CREATE TYPE "ResaleStatus" AS ENUM ('LISTED', 'SOLD', 'CANCELLED');

CREATE TABLE "resale_listings" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "seller_id" TEXT,
    "status" "ResaleStatus" NOT NULL DEFAULT 'LISTED',
    "price_cents" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "buyer_order_id" TEXT,
    "new_ticket_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sold_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    CONSTRAINT "resale_listings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resale_listings_ticket_id_key" ON "resale_listings"("ticket_id");
CREATE UNIQUE INDEX "resale_listings_token_key" ON "resale_listings"("token");
CREATE INDEX "resale_listings_status_idx" ON "resale_listings"("status");

ALTER TABLE "resale_listings" ADD CONSTRAINT "resale_listings_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resale_listings" ADD CONSTRAINT "resale_listings_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
