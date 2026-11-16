-- CreateTable
CREATE TABLE "CommunityMedia" (
    "chatId" INTEGER NOT NULL,
    "avatarKey" TEXT,
    "bannerKey" TEXT,
    "hasAvatar" BOOLEAN NOT NULL DEFAULT false,
    "hasBanner" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CommunityMedia_pkey" PRIMARY KEY ("chatId")
);

-- AddForeignKey
ALTER TABLE "CommunityMedia" ADD CONSTRAINT "CommunityMedia_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

