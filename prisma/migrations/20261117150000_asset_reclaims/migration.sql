CREATE TABLE "AssetReclaim" (
  "id" SERIAL PRIMARY KEY,
  "requestId" TEXT NOT NULL UNIQUE,
  "recipientId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "adminId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('currency', 'username')),
  "value" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "balanceBefore" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL CHECK ("balanceAfter" >= 0),
  "replacementUsername" TEXT,
  "checkpointId" INTEGER NOT NULL REFERENCES "StatCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AssetReclaim_recipientId_createdAt_idx" ON "AssetReclaim"("recipientId", "createdAt");
