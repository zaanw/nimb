-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "inviteHash" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'direct',
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "pairKey" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'member';

-- CreateIndex
CREATE UNIQUE INDEX "Chat_inviteHash_key" ON "Chat"("inviteHash");

