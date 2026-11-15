CREATE TABLE "UsernamePurchase" (
  "id" SERIAL PRIMARY KEY,
  "username" TEXT NOT NULL UNIQUE,
  "ownerId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "price" INTEGER NOT NULL CHECK ("price" > 0),
  "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "UsernamePurchase_ownerId_idx" ON "UsernamePurchase"("ownerId");
