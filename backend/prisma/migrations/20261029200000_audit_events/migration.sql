-- Who did what, to whom, and when.
--
-- Fourteen privileged routes could change a role, grant a permission, refund
-- money, assign a commission plan or send a payout, and none of them left a
-- record. "It just changed" is not an answer anyone can act on.

CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    -- Nullable, and SET NULL on delete: the record must OUTLIVE the account.
    -- The whole reason to log a deletion is to know who performed it, so a
    -- cascade would erase exactly the thing worth keeping.
    "actor_id" TEXT,
    -- Copied at write time. A renamed or deleted account would otherwise make
    -- an old row unreadable, and a later role change would silently rewrite
    -- the authority the action appears to have been taken under.
    "actor_email" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    -- Free-form subject rather than a foreign key per auditable model: a
    -- column per type would grow this table every time something new becomes
    -- auditable, and would block deleting the subject the row describes.
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT,
    "subject_label" TEXT,
    "details" JSONB,
    "ip" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- The journal is read newest-first, filtered by action or by subject.
CREATE INDEX "audit_events_at_idx" ON "audit_events"("at");
CREATE INDEX "audit_events_action_at_idx" ON "audit_events"("action", "at");
CREATE INDEX "audit_events_subject_type_subject_id_idx" ON "audit_events"("subject_type", "subject_id");
CREATE INDEX "audit_events_actor_id_idx" ON "audit_events"("actor_id");

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
