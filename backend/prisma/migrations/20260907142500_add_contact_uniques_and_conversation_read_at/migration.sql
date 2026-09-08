-- DropIndex
DROP INDEX IF EXISTS "contacts_instagramHandle_idx";

-- DropIndex
DROP INDEX IF EXISTS "contacts_primaryPhone_idx";

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "lastReadAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "contacts_primaryPhone_key" ON "contacts"("primaryPhone");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_instagramHandle_key" ON "contacts"("instagramHandle");

-- CreateIndex
CREATE INDEX "conversations_lastReadAt_idx" ON "conversations"("lastReadAt");
