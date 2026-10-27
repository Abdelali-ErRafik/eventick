-- Ticket management: buyer self-cancellation, exchange and organiser reissue.
ALTER TABLE "events" ADD COLUMN "cancel_cutoff_hours" INTEGER NOT NULL DEFAULT 48;
ALTER TABLE "tickets" ADD COLUMN "cancelled_at" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "replaces_ref" TEXT;
