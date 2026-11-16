ALTER TABLE "Member" ADD COLUMN "chatPinned" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "SavedMessage" (
 "id" SERIAL PRIMARY KEY,
 "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "messageId" INTEGER NOT NULL REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SavedMessage_userId_messageId_key" ON "SavedMessage"("userId","messageId");
CREATE INDEX "SavedMessage_userId_id_idx" ON "SavedMessage"("userId","id");
