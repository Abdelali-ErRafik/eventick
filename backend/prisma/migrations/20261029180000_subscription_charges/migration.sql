-- Charge the fixed monthly part of a plan.
--
-- "Pro · 3% + 499/mo" only ever charged the 3%, which made Pro cheaper than
-- Starter (5%) at EVERY volume — the tiers were economically backwards. The
-- monthly part is now withheld from the payout, and this table is what stops
-- it being withheld twice.

ALTER TABLE "payouts" ADD COLUMN "subscription_cents" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "subscription_charges" (
    "id" TEXT NOT NULL,
    "organiser_id" TEXT NOT NULL,
    "payout_id" TEXT NOT NULL,
    -- First instant of the billed calendar month, UTC. The month IS the key,
    -- so it is normalised on write.
    "month" TIMESTAMP(3) NOT NULL,
    -- Copied from the plan at run time, so a later price change cannot alter
    -- a month already billed.
    "amount_cents" INTEGER NOT NULL,
    "plan_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subscription_charges_pkey" PRIMARY KEY ("id")
);

-- THE guarantee: one charge per organiser per month, enforced by the database
-- rather than by a query that hopes to have seen every prior run.
CREATE UNIQUE INDEX "subscription_charges_organiser_id_month_key"
    ON "subscription_charges"("organiser_id", "month");
CREATE INDEX "subscription_charges_payout_id_idx" ON "subscription_charges"("payout_id");

ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_organiser_id_fkey"
    FOREIGN KEY ("organiser_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- CASCADE: cancelling a payout releases its months to be billed by a later
-- run, exactly as it releases its orders.
ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_payout_id_fkey"
    FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
