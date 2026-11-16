-- Existing S3 images remain available through User.avatarKey / bannerKey.
CREATE TABLE "ProfileImage" (
  "userId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('avatar','banner')),
  "data" BYTEA NOT NULL CHECK (octet_length("data") <= 5242880),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProfileImage_pkey" PRIMARY KEY ("userId", "kind"),
  CONSTRAINT "ProfileImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
