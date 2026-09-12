-- DropIndex
DROP INDEX "conversations_channel_idx";

-- DropIndex
DROP INDEX "conversations_lastMessageAt_idx";

-- DropIndex
DROP INDEX "messages_conversationId_idx";

-- CreateIndex
CREATE INDEX "conversations_channel_lastMessageAt_idx" ON "conversations"("channel", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "conversations_lastMessageAt_idx" ON "conversations"("lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt" DESC);
