-- Real commission and payouts.
--
-- Until now the Finance screen let an organiser pick their own plan from a
-- <select>, computed the fee in the browser, and stored neither. "Reversement"
-- named a payout that did not exist.

-- What the platform charges. Keyed by its own name rather than a cuid: the key
-- appears in config and in the UI, and a re-seed must not orphan the users
-- pointing at it.
CREATE TABLE "plans" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    -- Basis points (500 = 5%). Integer, so a rate cannot drift the way a
    -- float percentage does once it is multiplied across a month of orders.
    "rate_bps" INTEGER NOT NULL,
    "monthly_cents" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "plans_pkey" PRIMARY KEY ("key")
);

-- Assigned by an admin. SET NULL on plan deletion: losing a plan must not
-- delete the organiser with it.
ALTER TABLE "users" ADD COLUMN "plan_id" TEXT;
ALTER TABLE "users" ADD CONSTRAINT "users_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- Commission recorded ON THE ORDER at settlement, never recomputed. Nullable
-- because orders settled before this migration have no recorded fee, and
-- back-filling one would invent a charge that was never made.
ALTER TABLE "orders" ADD COLUMN "fee_cents" INTEGER;
ALTER TABLE "orders" ADD COLUMN "fee_plan_key" TEXT;

CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "organiser_id" TEXT NOT NULL,
    "holder_name" TEXT NOT NULL,
    -- Moroccan RIB, 24 digits, stored digits-only so two spellings of one
    -- account compare equal.
    "rib" TEXT NOT NULL,
    "bank" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bank_accounts_organiser_id_key" ON "bank_accounts"("organiser_id");
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organiser_id_fkey"
    FOREIGN KEY ("organiser_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- One transfer to one organiser for one period. Totals are frozen at creation
-- by copying from the orders, so a refund next week cannot change what was
-- already paid out last week.
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "organiser_id" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "gross_cents" INTEGER NOT NULL,
    "fee_cents" INTEGER NOT NULL,
    "net_cents" INTEGER NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),
    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payouts_organiser_id_status_idx" ON "payouts"("organiser_id", "status");
CREATE INDEX "payouts_status_idx" ON "payouts"("status");
-- RESTRICT, not CASCADE: a record of money sent must survive the account.
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_organiser_id_fkey"
    FOREIGN KEY ("organiser_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payout_orders" (
    "id" TEXT NOT NULL,
    "payout_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "gross_cents" INTEGER NOT NULL,
    "fee_cents" INTEGER NOT NULL,
    CONSTRAINT "payout_orders_pkey" PRIMARY KEY ("id")
);
-- THE safeguard: an order belongs to at most one payout, ever, so a second
-- run over an overlapping period cannot pay for the same tickets twice.
CREATE UNIQUE INDEX "payout_orders_order_id_key" ON "payout_orders"("order_id");
CREATE INDEX "payout_orders_payout_id_idx" ON "payout_orders"("payout_id");
ALTER TABLE "payout_orders" ADD CONSTRAINT "payout_orders_payout_id_fkey"
    FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payout_orders" ADD CONSTRAINT "payout_orders_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The three plans the browser used to hardcode, now the single source of
-- truth. Starter is the default so a newly approved organiser is never free.
INSERT INTO "plans" ("key", "label", "rate_bps", "monthly_cents", "is_default", "sort_order") VALUES
    ('starter',  'Starter',  500, 0,      true,  1),
    ('pro',      'Pro',      300, 49900,  false, 2),
    ('business', 'Business', 200, 199900, false, 3);
