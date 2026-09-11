-- AlterEnum
ALTER TYPE "MessageStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "inReplyTo" TEXT,
ADD COLUMN "references" TEXT,
ADD COLUMN "rfcMessageId" TEXT,
ADD COLUMN "subject" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "messages_idempotencyKey_key" ON "messages"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "messages_rfcMessageId_key" ON "messages"("rfcMessageId");
