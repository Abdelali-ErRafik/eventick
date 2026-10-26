-- AlterTable
ALTER TABLE "ticket_tiers" ADD COLUMN     "perks" TEXT[] DEFAULT ARRAY[]::TEXT[];
