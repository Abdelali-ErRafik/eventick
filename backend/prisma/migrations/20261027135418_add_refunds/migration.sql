-- Refunds: money actually returned, as distinct from a cancellation that only
-- voids tickets and releases stock.
ALTER TYPE "OrderStatus" ADD VALUE 'REFUNDED';

ALTER TABLE "orders" ADD COLUMN "refunded_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "refunded_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "refund_ref" TEXT;
