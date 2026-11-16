-- CreateTable
CREATE TABLE "ChatFolder" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolderChat" (
    "folderId" INTEGER NOT NULL,
    "chatId" INTEGER NOT NULL,

    CONSTRAINT "FolderChat_pkey" PRIMARY KEY ("folderId","chatId")
);

-- CreateIndex
CREATE INDEX "ChatFolder_userId_id_idx" ON "ChatFolder"("userId", "id");

-- AddForeignKey
ALTER TABLE "ChatFolder" ADD CONSTRAINT "ChatFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderChat" ADD CONSTRAINT "FolderChat_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ChatFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderChat" ADD CONSTRAINT "FolderChat_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

