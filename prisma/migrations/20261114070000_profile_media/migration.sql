-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarKey" TEXT,
ADD COLUMN     "bannerKey" TEXT,
ADD COLUMN     "bioPrivate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasAvatar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasBanner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mediaVersion" INTEGER NOT NULL DEFAULT 0;

