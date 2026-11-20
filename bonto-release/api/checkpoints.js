import { editionForGift } from "./collectibles.js";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { lockName } from "./identity.js";
export async function activityStats(tx, id) {
    const user = await tx.user.findUniqueOrThrow({
        where: { id },
        select: { statsOffsets: true },
    });
    const values = await Promise.all([
        tx.message.count({ where: { senderId: id } }),
        tx.post.count({ where: { authorId: id } }),
        tx.comment.count({ where: { authorId: id } }),
        tx.reaction.count({ where: { userId: id } }),
        tx.follow.count({ where: { followingId: id } }),
        tx.follow.count({ where: { followerId: id } }),
    ]);
    const offsets = user.statsOffsets;
    return Object.fromEntries([
        "messages",
        "posts",
        "comments",
        "reactions",
        "followers",
        "following",
    ].map((key, index) => [
        key,
        Math.max(0, values[index] - (offsets[key] || 0)),
    ]));
}
async function state(tx, id) {
    const user = await tx.user.findUniqueOrThrow({
        where: { id },
        select: {
            username: true,
            nimbBalance: true,
            verified: true,
            plus: true,
            nameFont: true,
            nameEffect: true,
            profileAccent: true,
            collectibleNumber: true,
        },
    });
    const [badges, gifts, names, stats] = await Promise.all([
        tx.badgeAward.findMany({
            where: { userId: id },
            orderBy: { badge: "asc" },
            select: { badge: true, awardedAt: true },
        }),
        tx.gift.findMany({
            where: { ownerId: id },
            orderBy: { id: "asc" },
            include: { events: { orderBy: { id: "asc" } } },
        }),
        tx.usernamePurchase.findMany({
            where: { ownerId: id },
            orderBy: { username: "asc" },
        }),
        activityStats(tx, id),
    ]);
    return JSON.parse(JSON.stringify({ user, badges, gifts, names, stats }));
}
export async function checkpoint(tx, userId, adminId, label) {
    const data = await state(tx, userId);
    return tx.statCheckpoint.create({
        data: {
            userId,
            adminId,
            label,
            state: data,
        },
    });
}
const tokenFor = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function registerCheckpoints(app, db, auth, notify) {
    async function owner(req, reply) {
        const viewer = await auth(req, reply);
        if (!viewer)
            return null;
        if (viewer.userId !== 1) {
            reply
                .code(403)
                .send({ error: "Откатывать статы может только владелец nimb" });
            return null;
        }
        return viewer;
    }
    app.get("/api/admin/users/:id/checkpoints", async (req, reply) => {
        if (!(await owner(req, reply)))
            return;
        const id = z.coerce
            .number()
            .int()
            .positive()
            .parse(req.params.id);
        if (!(await db.user.findUnique({ where: { id }, select: { id: true } })))
            return reply.code(404).send({ error: "Пользователь не найден" });
        const [points, stats] = await Promise.all([
            db.statCheckpoint.findMany({
                where: { userId: id },
                orderBy: { id: "desc" },
                take: 50,
                select: { id: true, label: true, createdAt: true },
            }),
            db.$transaction((tx) => activityStats(tx, id)),
        ]);
        return { points, stats };
    });
    app.post("/api/admin/users/:id/checkpoints", async (req, reply) => {
        const actor = await owner(req, reply);
        if (!actor)
            return;
        const id = z.coerce
            .number()
            .int()
            .positive()
            .parse(req.params.id);
        const { label } = z
            .object({ label: z.string().trim().min(1).max(80) })
            .parse(req.body);
        if (!(await db.user.findUnique({ where: { id }, select: { id: true } })))
            return reply.code(404).send({ error: "Пользователь не найден" });
        const point = await db.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(${id})`;
            return checkpoint(tx, id, actor.userId, label);
        });
        return {
            point: { id: point.id, label: point.label, createdAt: point.createdAt },
        };
    });
    app.post("/api/admin/users/:id/checkpoints/reset-all", async (req, reply) => {
        const actor = await owner(req, reply);
        if (!actor)
            return;
        const id = z.coerce
            .number()
            .int()
            .positive()
            .parse(req.params.id);
        if (!(await db.user.findUnique({ where: { id }, select: { id: true } })))
            return reply.code(404).send({ error: "Пользователь не найден" });
        const point = await db.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(${id})`;
            const data = await state(tx, id);
            const username = data.names.some((n) => n.username === data.user.username)
                ? `nimb_${id}_${randomBytes(4).toString("hex")}`
                : data.user.username;
            const cleared = {
                user: {
                    ...data.user,
                    username,
                    nimbBalance: 0,
                    verified: false,
                    plus: false,
                    nameFont: "default",
                    nameEffect: "none",
                    profileAccent: "gold",
                    collectibleNumber: null,
                },
                gifts: [],
                names: [],
                badges: [],
                stats: Object.fromEntries(Object.keys(data.stats).map((key) => [key, 0])),
            };
            return tx.statCheckpoint.create({
                data: {
                    userId: id,
                    adminId: actor.userId,
                    label: "Нулевые статы",
                    state: cleared,
                },
            });
        });
        return {
            point: { id: point.id, label: point.label, createdAt: point.createdAt },
        };
    });
    app.post("/api/admin/users/:id/stats/reset", async (req, reply) => {
        const actor = await owner(req, reply);
        if (!actor)
            return;
        const id = z.coerce
            .number()
            .int()
            .positive()
            .parse(req.params.id);
        if (!(await db.user.findUnique({ where: { id }, select: { id: true } })))
            return reply.code(404).send({ error: "Пользователь не найден" });
        await db.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(${id})`;
            const backup = await checkpoint(tx, id, actor.userId, "Перед обнулением счётчиков");
            const current = await state(tx, id);
            const user = await tx.user.findUniqueOrThrow({
                where: { id },
                select: { statsOffsets: true },
            });
            const offsets = user.statsOffsets;
            await tx.user.update({
                where: { id },
                data: {
                    statsOffsets: Object.fromEntries(Object.entries(current.stats).map(([key, value]) => [
                        key,
                        value + (offsets[key] || 0),
                    ])),
                },
            });
            await tx.statRestore.create({
                data: {
                    userId: id,
                    adminId: actor.userId,
                    checkpointId: backup.id,
                    backupId: backup.id,
                    kind: "reset",
                },
            });
        });
        await notify(id);
        return { ok: true };
    });
    app.post("/api/admin/users/:id/checkpoints/:pointId/preview", async (req, reply) => {
        if (!(await owner(req, reply)))
            return;
        const { id, pointId } = z
            .object({
            id: z.coerce.number().int().positive(),
            pointId: z.coerce.number().int().positive(),
        })
            .parse(req.params);
        const point = await db.statCheckpoint.findFirst({
            where: { id: pointId, userId: id },
        });
        if (!point)
            return reply.code(404).send({ error: "Точка не найдена" });
        const current = await db.$transaction((tx) => state(tx, id));
        const target = point.state;
        return {
            point: { id: point.id, label: point.label, createdAt: point.createdAt },
            token: tokenFor(current),
            changes: {
                balance: {
                    before: current.user.nimbBalance,
                    after: target.user.nimbBalance,
                },
                gifts: { before: current.gifts.length, after: target.gifts.length },
                names: {
                    before: current.names.map((n) => n.username),
                    after: target.names.map((n) => n.username),
                },
                badges: {
                    before: current.badges.map((b) => b.badge),
                    after: target.badges.map((b) => b.badge),
                },
                verified: {
                    before: current.user.verified,
                    after: target.user.verified,
                },
                plus: { before: current.user.plus, after: target.user.plus },
                username: {
                    before: current.user.username,
                    after: target.user.username,
                },
                number: {
                    before: current.user.collectibleNumber,
                    after: target.user.collectibleNumber,
                },
                appearance: {
                    before: [
                        current.user.nameFont,
                        current.user.nameEffect,
                        current.user.profileAccent,
                    ].join(" / "),
                    after: [
                        target.user.nameFont,
                        target.user.nameEffect,
                        target.user.profileAccent,
                    ].join(" / "),
                },
                stats: { before: current.stats, after: target.stats },
            },
        };
    });
    app.post("/api/admin/users/:id/checkpoints/:pointId/restore", async (req, reply) => {
        const actor = await owner(req, reply);
        if (!actor)
            return;
        const { id, pointId } = z
            .object({
            id: z.coerce.number().int().positive(),
            pointId: z.coerce.number().int().positive(),
        })
            .parse(req.params);
        const { token } = z
            .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
            .parse(req.body);
        const point = await db.statCheckpoint.findFirst({
            where: { id: pointId, userId: id },
        });
        if (!point)
            return reply.code(404).send({ error: "Точка не найдена" });
        const target = point.state;
        const outcome = await db.$transaction(async (tx) => {
            for (const name of [
                ...new Set([
                    target.user.username,
                    ...target.names.map((n) => n.username),
                ]),
            ].sort())
                await lockName(tx, name);
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(${id})`;
            const current = await state(tx, id);
            if (tokenFor(current) !== token)
                return {
                    error: "Статы изменились после просмотра. Откройте предпросмотр заново.",
                };
            for (const name of [
                target.user.username,
                ...target.names.map((n) => n.username),
            ]) {
                const [purchase, used] = await Promise.all([
                    tx.usernamePurchase.findUnique({
                        where: { username: name },
                        select: { ownerId: true },
                    }),
                    tx.user.findUnique({
                        where: { username: name },
                        select: { id: true },
                    }),
                ]);
                if ((purchase && purchase.ownerId !== id) ||
                    (used && used.id !== id))
                    return {
                        error: `Адрес ${name} уже принадлежит другому пользователю. Откат отменён.`,
                    };
            }
            if (await tx.gift.count({
                where: {
                    id: { in: target.gifts.map((g) => g.id) },
                    ownerId: { not: id },
                },
            }))
                return {
                    error: "Один из подарков уже принадлежит другому пользователю. Откат отменён.",
                };
            const backup = await checkpoint(tx, id, actor.userId, "Перед откатом: " + point.label.slice(0, 55));
            const offsets = (await tx.user.findUniqueOrThrow({
                where: { id },
                select: { statsOffsets: true },
            })).statsOffsets;
            const statsOffsets = Object.fromEntries(Object.entries(current.stats).map(([key, value]) => [
                key,
                value + (offsets[key] || 0) - (target.stats[key] || 0),
            ]));
            await tx.user.update({
                where: { id },
                data: { ...target.user, statsOffsets },
            });
            await tx.badgeAward.deleteMany({ where: { userId: id } });
            if (target.badges.length)
                await tx.badgeAward.createMany({
                    data: target.badges.map((b) => ({
                        userId: id,
                        badge: b.badge,
                        awardedAt: new Date(b.awardedAt),
                    })),
                });
            await tx.gift.deleteMany({
                where: {
                    ownerId: id,
                    id: { notIn: target.gifts.map((g) => g.id) },
                },
            });
            for (const g of target.gifts) {
                const edition = await editionForGift(tx, g.id, g.template);
                await tx.gift.upsert({
                    where: { id: g.id },
                    create: {
                        id: g.id,
                        editionId: edition.id,
                        ownerId: id,
                        template: g.template,
                        pinned: g.pinned,
                        receivedAt: new Date(g.receivedAt),
                    },
                    update: {
                        editionId: edition.id,
                        template: g.template,
                        pinned: g.pinned,
                        receivedAt: new Date(g.receivedAt),
                    },
                });
                for (const e of g.events)
                    await tx.giftEvent.upsert({
                        where: { id: e.id },
                        create: {
                            id: e.id,
                            giftId: g.id,
                            senderId: e.senderId,
                            createdAt: new Date(e.createdAt),
                        },
                        update: {},
                    });
            }
            await tx.usernamePurchase.deleteMany({
                where: {
                    ownerId: id,
                    username: { notIn: target.names.map((n) => n.username) },
                },
            });
            for (const n of target.names) {
                const data = {
                    ownerId: id,
                    price: n.price,
                    public: n.public,
                    grantedById: n.grantedById,
                    purchasedAt: new Date(n.purchasedAt),
                };
                await tx.usernamePurchase.upsert({
                    where: { username: n.username },
                    create: { ...data, username: n.username },
                    update: data,
                });
            }
            await tx.statRestore.create({
                data: {
                    userId: id,
                    adminId: actor.userId,
                    checkpointId: point.id,
                    backupId: backup.id,
                    kind: "restore",
                },
            });
            return { backupId: backup.id };
        }, { isolationLevel: "Serializable", timeout: 20000 });
        if ("error" in outcome)
            return reply.code(409).send({ error: outcome.error });
        await notify(id);
        return { ok: true, backupId: outcome.backupId };
    });
}
