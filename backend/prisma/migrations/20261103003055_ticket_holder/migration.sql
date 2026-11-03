-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "holder_id" TEXT;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_holder_id_fkey" FOREIGN KEY ("holder_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
