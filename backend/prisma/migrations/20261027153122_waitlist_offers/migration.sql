-- Waitlist offers: a freed seat is reserved for the next person in line for a
-- limited window, rather than announced to everyone as a race.
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'CLAIMED', 'EXPIRED');

ALTER TABLE "waitlist_entries" ADD COLUMN "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING';
ALTER TABLE "waitlist_entries" ADD COLUMN "claim_token" TEXT;
ALTER TABLE "waitlist_entries" ADD COLUMN "claim_tier_id" TEXT;
ALTER TABLE "waitlist_entries" ADD COLUMN "claim_expires_at" TIMESTAMP(3);
ALTER TABLE "waitlist_entries" ADD COLUMN "offered_at" TIMESTAMP(3);
ALTER TABLE "waitlist_entries" ADD COLUMN "claimed_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "waitlist_entries_claim_token_key" ON "waitlist_entries"("claim_token");
CREATE INDEX "waitlist_entries_event_id_status_created_at_idx" ON "waitlist_entries"("event_id", "status", "created_at");
CREATE INDEX "waitlist_entries_status_claim_expires_at_idx" ON "waitlist_entries"("status", "claim_expires_at");
