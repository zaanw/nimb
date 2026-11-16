import { z } from "zod";
export function registerMessenger(app, db, auth, refresh) {
    app.patch("/api/chats/:id/preferences", async (req, reply) => {
        const viewer = await auth(req, reply);
        if (!viewer)
            return;
        const chatId = z.coerce
            .number()
            .int()
            .positive()
            .parse(req.params.id);
        const data = z
            .object({
            chatPinned: z.boolean().optional(),
            archived: z.boolean().optional(),
        })
            .refine((v) => v.chatPinned !== undefined || v.archived !== undefined)
            .parse(req.body);
        const result = await db.member.updateMany({
            where: { chatId, userId: viewer.userId },
            data,
        });
        if (!result.count)
            return reply.code(404).send({ error: "Чат не найден" });
        refresh(viewer.userId);
        return { ok: true };
    });
    app.put("/api/messages/:id/saved", async (req, reply) => {
        const viewer = await auth(req, reply);
        if (!viewer)
            return;
        const messageId = z.coerce
            .number()
            .int()
            .positive()
            .parse(req.params.id);
        const { saved } = z.object({ saved: z.boolean() }).parse(req.body);
        const message = await db.message.findFirst({
            where: {
                id: messageId,
                chat: { members: { some: { userId: viewer.userId } } },
            },
            select: { id: true },
        });
        if (!message)
            return reply.code(404).send({ error: "Сообщение не найдено" });
        if (saved)
            await db.savedMessage.upsert({
                where: { userId_messageId: { userId: viewer.userId, messageId } },
                create: { userId: viewer.userId, messageId },
                update: {},
            });
        else
            await db.savedMessage.deleteMany({
                where: { userId: viewer.userId, messageId },
            });
        refresh(viewer.userId);
        return { ok: true };
    });
    app.get("/api/saved", async (req, reply) => {
        const viewer = await auth(req, reply);
        if (!viewer)
            return;
        const { before, q } = z
            .object({
            before: z.coerce.number().int().positive().optional(),
            q: z.string().trim().max(100).default(""),
        })
            .parse(req.query);
        const rows = await db.savedMessage.findMany({
            where: {
                userId: viewer.userId,
                ...(before ? { id: { lt: before } } : {}),
                message: {
                    chat: { members: { some: { userId: viewer.userId } } },
                    ...(q ? { text: { contains: q, mode: "insensitive" } } : {}),
                },
            },
            orderBy: { id: "desc" },
            take: 31,
            select: {
                id: true,
                savedAt: true,
                message: {
                    select: {
                        id: true,
                        chatId: true,
                        text: true,
                        createdAt: true,
                        sender: {
                            select: {
                                id: true,
                                name: true,
                                username: true,
                                verified: true,
                                plus: true,
                                nameFont: true,
                                nameEffect: true,
                            },
                        },
                        chat: { select: { kind: true, title: true } },
                        attachment: {
                            select: { id: true, name: true, mime: true, size: true },
                        },
                    },
                },
            },
        });
        return {
            items: rows.slice(0, 30),
            nextCursor: rows.length > 30 ? rows[29].id : null,
        };
    });
}
