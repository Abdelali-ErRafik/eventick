-- A share recipient needs proof of ONE ticket.
--
-- Claiming a share puts the replacement ticket on the sender's order, so the
-- recipient has no order token to present — and giving them one would be
-- wrong anyway, since it would unlock the sender's remaining tickets too.
--
-- Nullable with no backfill on purpose: an ordinary ticket is authorised
-- through its order, and minting tokens for tickets nobody needs them for
-- would only widen what there is to leak.

ALTER TABLE "tickets" ADD COLUMN "access_token" TEXT;

CREATE UNIQUE INDEX "tickets_access_token_key" ON "tickets"("access_token");
