-- Four things a real event organiser needs in week one.
--
-- 1. A per-BUYER ticket limit. The existing cap is 8 per ORDER, so one email
--    could place three orders and take 24 seats of a high-demand show —
--    verified against the running app. That is the difference between fans
--    and resellers getting the tickets.
-- 2. Event cancellation. EventStatus.CANCELLED already existed in the enum
--    and NO route ever set it, so calling off a festival meant refunding
--    buyers one order at a time.
-- 3. Per-tier sales windows. Early-bird pricing, staged releases and "doors
--    close at midnight" were all inexpressible; every tier went live at once.
-- 4. Comp tickets. No way to put press, sponsors or the artist's guest list on
--    the door without a 100% promo code, which lands in revenue and
--    commission as a zero-value sale and muddles the books.

-- ── 1. Per-buyer limit ────────────────────────────────────────────────────
-- 10 by default rather than unlimited: a limit nobody set is the one that
-- bites during the only sale that matters. 0 disables it.
ALTER TABLE "events" ADD COLUMN "max_per_buyer" INTEGER NOT NULL DEFAULT 10;

-- ── 2. Cancellation ──────────────────────────────────────────────────────
-- The reason is stored, not just the status: "why was my festival cancelled"
-- is the first thing every buyer asks, and a status cannot answer it.
ALTER TABLE "events" ADD COLUMN "cancelled_at" TIMESTAMP(3);
ALTER TABLE "events" ADD COLUMN "cancel_reason" TEXT;

-- ── Resale becomes opt-in ────────────────────────────────────────────────
-- Default FALSE on purpose, including for events that already exist. Resale
-- is a secondary market; whether an event has one is the organiser's call,
-- not a platform default. Existing listings keep working — the flag gates
-- NEW listings only, so nothing in flight breaks.
ALTER TABLE "events" ADD COLUMN "allow_resale" BOOLEAN NOT NULL DEFAULT false;

-- ── 3. Sales windows ─────────────────────────────────────────────────────
-- Both NULL means "on sale while the event is published", which is exactly
-- how every existing tier already behaves — so no backfill is needed.
ALTER TABLE "ticket_tiers" ADD COLUMN "sales_start_at" TIMESTAMP(3);
ALTER TABLE "ticket_tiers" ADD COLUMN "sales_end_at" TIMESTAMP(3);

-- ── 4. Comp tickets ──────────────────────────────────────────────────────
CREATE TYPE "TicketKind" AS ENUM ('SOLD', 'COMP');

-- Every existing ticket was bought, so SOLD is the correct backfill.
ALTER TABLE "tickets" ADD COLUMN "kind" "TicketKind" NOT NULL DEFAULT 'SOLD';

CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "tier_id" TEXT NOT NULL,
    "guest_name" TEXT NOT NULL,
    -- Optional: a guest list is often just names, and demanding an address
    -- would block the common case.
    "guest_email" TEXT,
    "note" TEXT,
    -- Null while the invitation is only a name on a list.
    "ticket_id" TEXT,
    "issued_by_id" TEXT,
    -- Copied, so the guest list still says who issued it after that account
    -- is removed.
    "issued_by_email" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- One invitation per ticket: the ticket is the thing that admits someone, so
-- two invitations pointing at it would mean two guests, one seat.
CREATE UNIQUE INDEX "invitations_ticket_id_key" ON "invitations"("ticket_id");
CREATE INDEX "invitations_event_id_idx" ON "invitations"("event_id");
CREATE INDEX "invitations_tier_id_idx" ON "invitations"("tier_id");

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- RESTRICT: a tier with guests on the list cannot vanish under them.
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tier_id_fkey"
    FOREIGN KEY ("tier_id") REFERENCES "ticket_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- SET NULL: voiding the ticket leaves the guest on the list, which is what an
-- organiser wants to see — "issued, then cancelled" is information.
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_issued_by_id_fkey"
    FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
