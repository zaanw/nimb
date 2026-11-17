ALTER TABLE "Session" ADD COLUMN "clientIp" TEXT, ADD COLUMN "deviceHash" TEXT;
CREATE TABLE "LoginDevice" (
 "id" SERIAL PRIMARY KEY,
 "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "ip" TEXT NOT NULL,
 "deviceHash" TEXT NOT NULL,
 "label" TEXT NOT NULL,
 "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "LoginDevice_userId_ip_deviceHash_key" ON "LoginDevice"("userId","ip","deviceHash");
CREATE INDEX "LoginDevice_userId_lastSeen_idx" ON "LoginDevice"("userId","lastSeen");
CREATE TABLE "NetworkBan" (
 "id" SERIAL PRIMARY KEY,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('ip','device')),
 "value" TEXT NOT NULL,
 "reason" TEXT NOT NULL,
 "targetUserId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "createdById" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "revokedById" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3),
 "revokedAt" TIMESTAMP(3)
);
CREATE INDEX "NetworkBan_kind_value_revokedAt_idx" ON "NetworkBan"("kind","value","revokedAt");
CREATE INDEX "NetworkBan_targetUserId_id_idx" ON "NetworkBan"("targetUserId","id");
CREATE TABLE "TrustedProxy" (
 "ip" TEXT PRIMARY KEY,
 "createdById" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Session_clientIp_idx" ON "Session"("clientIp");
CREATE INDEX "Session_deviceHash_idx" ON "Session"("deviceHash");
