-- The live entry counter aggregates tickets by status; the tier FK had no index.
CREATE INDEX "tickets_status_idx" ON "tickets"("status");
CREATE INDEX "tickets_tier_id_idx" ON "tickets"("tier_id");
