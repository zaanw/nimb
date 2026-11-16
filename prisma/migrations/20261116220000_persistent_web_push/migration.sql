-- Server-only application signing keys; never included in public API responses.
CREATE TABLE "WebPushConfig" (
 "id" INTEGER PRIMARY KEY CHECK ("id" = 1),
 "publicKey" TEXT NOT NULL,
 "privateKey" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
