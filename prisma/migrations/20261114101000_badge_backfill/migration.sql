INSERT INTO "BadgeAward" ("userId", "badge", "awardedAt")
SELECT "id", 'early', "createdAt" FROM "User" WHERE "id" <= 100 AND "emailVerified" = true
ON CONFLICT ("userId", "badge") DO NOTHING;
INSERT INTO "BadgeAward" ("userId", "badge", "awardedAt")
SELECT "Member"."userId", 'channel_author', MIN("Chat"."createdAt")
FROM "Member" JOIN "Chat" ON "Member"."chatId" = "Chat"."id"
WHERE "Member"."role" = 'owner' AND "Chat"."kind" = 'channel'
GROUP BY "Member"."userId"
ON CONFLICT ("userId", "badge") DO NOTHING;
