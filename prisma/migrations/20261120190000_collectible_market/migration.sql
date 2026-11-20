CREATE TABLE "GiftEdition" (
  "id" SERIAL NOT NULL,
  "originalGiftId" INTEGER NOT NULL,
  "template" TEXT NOT NULL,
  "serialNumber" INTEGER NOT NULL,
  "backdrop" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "mintedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GiftEdition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GiftEdition_originalGiftId_key" ON "GiftEdition"("originalGiftId");
CREATE UNIQUE INDEX "GiftEdition_template_serialNumber_key" ON "GiftEdition"("template", "serialNumber");
CREATE TABLE "GiftCounter" (
  "template" TEXT NOT NULL,
  "lastNumber" INTEGER NOT NULL,
  CONSTRAINT "GiftCounter_pkey" PRIMARY KEY ("template")
);
ALTER TABLE "Gift" ADD COLUMN "editionId" INTEGER;
-- Existing ownership, IDs, events and timestamps are retained. Random traits are assigned once.
INSERT INTO "GiftEdition" ("id", "originalGiftId", "template", "serialNumber", "backdrop", "symbol", "mintedAt")
SELECT "id", "id", "template", ROW_NUMBER() OVER (PARTITION BY "template" ORDER BY "id"),
  (ARRAY['sapphire','amethyst','emerald','rose','amber','ocean','graphite','sunset'])[1+floor(random()*8)::int],
  (ARRAY['stars','crowns','hearts','moons','diamonds','flowers','lightning','clovers'])[1+floor(random()*8)::int], "receivedAt"
FROM "Gift";
SELECT setval(pg_get_serial_sequence('"GiftEdition"', 'id'), COALESCE(MAX("id"),1), COUNT(*)>0) FROM "GiftEdition";
UPDATE "Gift" SET "editionId" = "id";
INSERT INTO "GiftCounter" ("template", "lastNumber") SELECT "template", MAX("serialNumber") FROM "GiftEdition" GROUP BY "template";
CREATE UNIQUE INDEX "Gift_editionId_key" ON "Gift"("editionId");
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "GiftEdition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "GiftPurchase" (
  "requestId" TEXT NOT NULL,
  "originalGiftId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "template" TEXT NOT NULL,
  "giftId" INTEGER,
  "price" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GiftPurchase_pkey" PRIMARY KEY ("requestId")
);
CREATE INDEX "GiftPurchase_userId_createdAt_idx" ON "GiftPurchase"("userId", "createdAt");
ALTER TABLE "GiftPurchase" ADD CONSTRAINT "GiftPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftPurchase" ADD CONSTRAINT "GiftPurchase_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "Gift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GiftEdition" ADD CONSTRAINT "GiftEdition_serialNumber_positive" CHECK ("serialNumber">0);
ALTER TABLE "GiftPurchase" ADD CONSTRAINT "GiftPurchase_price_positive" CHECK ("price">0);
