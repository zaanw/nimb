ALTER TABLE "User"
  ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "plus" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "nameFont" TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN "nameEffect" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "profileAccent" TEXT NOT NULL DEFAULT 'gold',
  ADD COLUMN "collectibleNumber" TEXT;
CREATE UNIQUE INDEX "User_collectibleNumber_key" ON "User"("collectibleNumber");
CREATE TABLE "IdentityGrant" (
  "id" SERIAL PRIMARY KEY,
  "recipientId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "adminId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "IdentityGrant_recipientId_createdAt_idx" ON "IdentityGrant"("recipientId","createdAt");

-- Enable the requested appearance for the existing owner; no privileges are granted to other accounts.
UPDATE "User" SET "nameFont" = 'rubik', "nameEffect" = 'rainbow' WHERE "id" = 1;
