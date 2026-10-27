-- Row width for numbered tiers. 12 was hardcoded in seatFor(); keeping it as
-- the default means existing seat numbering is unchanged.
ALTER TABLE "ticket_tiers" ADD COLUMN "seats_per_row" INTEGER NOT NULL DEFAULT 12;
