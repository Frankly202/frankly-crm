-- CreateIndex
CREATE UNIQUE INDEX "conversations_contactId_channel_key" ON "conversations"("contactId", "channel");
