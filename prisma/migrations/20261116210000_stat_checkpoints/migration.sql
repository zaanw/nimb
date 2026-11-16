ALTER TABLE "User" ADD COLUMN "statsOffsets" JSONB NOT NULL DEFAULT '{}';
CREATE TABLE "StatCheckpoint" (
 "id" SERIAL PRIMARY KEY,
 "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "adminId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "label" TEXT NOT NULL,
 "state" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "StatCheckpoint_userId_id_idx" ON "StatCheckpoint"("userId","id");
CREATE TABLE "StatRestore" (
 "id" SERIAL PRIMARY KEY,
 "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "adminId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "checkpointId" INTEGER NOT NULL REFERENCES "StatCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "backupId" INTEGER NOT NULL REFERENCES "StatCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "kind" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "StatRestore_userId_id_idx" ON "StatRestore"("userId","id");

CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");
CREATE INDEX "Post_authorId_idx" ON "Post"("authorId");
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");
CREATE INDEX "Reaction_userId_idx" ON "Reaction"("userId");
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");
