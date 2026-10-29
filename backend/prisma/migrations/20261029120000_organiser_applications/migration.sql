-- Becoming an organiser: a request an admin decides on.
--
-- Purely additive: one enum, one table, two indexes and two foreign keys.
-- Nothing existing is altered, so this cannot affect any current row.

CREATE TYPE "OrganiserApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

CREATE TABLE "organiser_applications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "OrganiserApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "display_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "pitch" TEXT NOT NULL,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organiser_applications_pkey" PRIMARY KEY ("id")
);

-- The admin queue reads by status; a user's own page reads by user.
CREATE INDEX "organiser_applications_status_idx" ON "organiser_applications"("status");
CREATE INDEX "organiser_applications_user_id_idx" ON "organiser_applications"("user_id");

-- Cascade: an application is meaningless without its applicant.
ALTER TABLE "organiser_applications"
    ADD CONSTRAINT "organiser_applications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull: the decision survives the reviewer's account being removed, so
-- the record of what was decided is not lost with the person who decided it.
ALTER TABLE "organiser_applications"
    ADD CONSTRAINT "organiser_applications_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
