-- Ticket sharing: hand a ticket to someone else, with a claim step.
CREATE TYPE "ShareStatus" AS ENUM ('OPEN', 'CLAIMED', 'REVOKED');

CREATE TABLE "ticket_shares" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "sender_id" TEXT,
    "status" "ShareStatus" NOT NULL DEFAULT 'OPEN',
    "token" TEXT,
    "message" TEXT,
    "new_ticket_id" TEXT,
    "claimed_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "ticket_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_shares_token_key" ON "ticket_shares"("token");
CREATE INDEX "ticket_shares_ticket_id_idx" ON "ticket_shares"("ticket_id");
CREATE INDEX "ticket_shares_status_idx" ON "ticket_shares"("status");

ALTER TABLE "ticket_shares" ADD CONSTRAINT "ticket_shares_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_shares" ADD CONSTRAINT "ticket_shares_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
