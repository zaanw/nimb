-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hasMusic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "musicArtist" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "musicKey" TEXT,
ADD COLUMN     "musicMime" TEXT,
ADD COLUMN     "musicTitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "musicVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BadgeAward" (
    "userId" INTEGER NOT NULL,
    "badge" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BadgeAward_pkey" PRIMARY KEY ("userId","badge")
);

-- CreateTable
CREATE TABLE "Gift" (
    "id" SERIAL NOT NULL,
    "template" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftEvent" (
    "id" SERIAL NOT NULL,
    "giftId" INTEGER NOT NULL,
    "senderId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostImage" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,

    CONSTRAINT "PostImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageView" (
    "messageId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageView_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateIndex
CREATE INDEX "Gift_ownerId_id_idx" ON "Gift"("ownerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PostImage_postId_key" ON "PostImage"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "PostImage_objectKey_key" ON "PostImage"("objectKey");

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftEvent" ADD CONSTRAINT "GiftEvent_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "Gift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftEvent" ADD CONSTRAINT "GiftEvent_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostImage" ADD CONSTRAINT "PostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageView" ADD CONSTRAINT "MessageView_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageView" ADD CONSTRAINT "MessageView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

