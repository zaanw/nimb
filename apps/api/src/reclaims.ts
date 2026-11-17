import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { checkpoint } from "./checkpoints.js";
import { lockName } from "./identity.js";

type Auth = (
  req: FastifyRequest,
  reply: FastifyReply,
) => Promise<{ userId: number } | null>;
const address = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/^@/, ""))
  .pipe(z.string().regex(/^(?:[a-z0-9_]{1,24}|\+[1-9][0-9]{2,11})$/));
const common = {
  requestId: z.uuid(),
  reason: z.string().trim().min(3).max(300),
};
const input = z.discriminatedUnion("kind", [
  z.object({
    ...common,
    kind: z.literal("currency"),
    amount: z.number().int().min(1).max(2147483647),
    expectedBalance: z.number().int().min(0).max(2147483647),
  }),
  z.object({ ...common, kind: z.literal("username"), username: address }),
]);

export function registerReclaims(
  app: FastifyInstance,
  db: PrismaClient,
  auth: Auth,
  notify: (id: number) => Promise<void>,
) {
  async function owner(req: FastifyRequest, reply: FastifyReply) {
    const actor = await auth(req, reply);
    if (!actor) return null;
    if (actor.userId !== 1) {
      reply.code(403).send({
        error: "Забирать адреса и списывать нимбики может только владелец nimb",
      });
      return null;
    }
    return actor;
  }
  app.get("/api/admin/users/:id/reclaims", async (req, reply) => {
    if (!(await owner(req, reply))) return;
    const id = z.coerce
      .number()
      .int()
      .positive()
      .parse((req.params as { id: string }).id);
    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        username: true,
        collectibleNumber: true,
        nimbBalance: true,
        purchasedUsernames: {
          select: { username: true, price: true },
          orderBy: { id: "desc" },
        },
      },
    });
    if (!user) return reply.code(404).send({ error: "Пользователь не найден" });
    const history = await db.assetReclaim.findMany({
      where: { recipientId: id },
      orderBy: { id: "desc" },
      take: 30,
      select: {
        id: true,
        kind: true,
        value: true,
        reason: true,
        balanceBefore: true,
        balanceAfter: true,
        replacementUsername: true,
        checkpointId: true,
        createdAt: true,
      },
    });
    return { user, history };
  });
  app.post(
    "/api/admin/users/:id/reclaims",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const actor = await owner(req, reply);
      if (!actor) return;
      const id = z.coerce
        .number()
        .int()
        .positive()
        .parse((req.params as { id: string }).id);
      const data = input.parse(req.body);
      const value =
        data.kind === "currency" ? String(data.amount) : data.username;
      const fallback = `nimb_${id}_${randomBytes(4).toString("hex")}`;
      const result = await db.$transaction(
        async (tx) => {
          // Idempotency covers retries and concurrent confirmations, including other users.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.requestId}), 116)`;
          const previous = await tx.assetReclaim.findUnique({
            where: { requestId: data.requestId },
          });
          if (previous) {
            if (
              previous.recipientId !== id ||
              previous.adminId !== actor.userId ||
              previous.kind !== data.kind ||
              previous.value !== value ||
              previous.reason !== data.reason
            )
              return {
                status: 409,
                error:
                  "Этот запрос уже выполнен с другими данными. Откройте действие заново.",
              };
            return { record: previous, replayed: true };
          }
          // Keep namespace -> user lock order shared with wallet purchases and restores.
          if (data.kind === "username")
            for (const name of [data.username, fallback].sort())
              await lockName(tx, name);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${id})`;
          const user = await tx.user.findUnique({
            where: { id },
            select: {
              username: true,
              collectibleNumber: true,
              nimbBalance: true,
            },
          });
          if (!user) return { status: 404, error: "Пользователь не найден" };
          let replacementUsername: string | null = null;
          if (data.kind === "currency") {
            if (user.nimbBalance !== data.expectedBalance)
              return {
                status: 409,
                error:
                  "Баланс изменился. Обновите данные и подтвердите списание заново.",
              };
            if (data.amount > user.nimbBalance)
              return { status: 400, error: "На балансе недостаточно нимбиков" };
          } else {
            const purchase = await tx.usernamePurchase.findUnique({
              where: { username: data.username },
            });
            const active =
              user.username === data.username ||
              user.collectibleNumber === data.username;
            if ((!purchase || purchase.ownerId !== id) && !active)
              return {
                status: 404,
                error:
                  "Этот юзернейм или номер больше не принадлежит пользователю",
              };
            if (purchase && purchase.ownerId !== id)
              return {
                status: 409,
                error: "У адреса другой владелец. Отзыв отменён.",
              };
            if (user.username === data.username) {
              const taken =
                (await tx.user.findUnique({
                  where: { username: fallback },
                  select: { id: true },
                })) ||
                (await tx.usernamePurchase.findUnique({
                  where: { username: fallback },
                  select: { id: true },
                }));
              if (taken)
                return {
                  status: 409,
                  error:
                    "Не удалось подобрать новый логин. Повторите действие.",
                };
              replacementUsername = fallback;
            }
          }
          const point = await checkpoint(
            tx,
            id,
            actor.userId,
            data.kind === "currency"
              ? `Перед списанием ${data.amount} нимбиков`
              : `Перед отзывом ${data.username}`,
          );
          if (data.kind === "currency") {
            const changed = await tx.user.updateMany({
              where: { id, nimbBalance: { gte: data.amount } },
              data: { nimbBalance: { decrement: data.amount } },
            });
            if (!changed.count)
              throw new Error("Баланс изменился во время списания");
          } else {
            await tx.user.update({
              where: { id },
              data: {
                ...(replacementUsername
                  ? { username: replacementUsername }
                  : {}),
                ...(user.collectibleNumber === data.username
                  ? { collectibleNumber: null }
                  : {}),
              },
            });
            await tx.usernamePurchase.deleteMany({
              where: { username: data.username, ownerId: id },
            });
          }
          const record = await tx.assetReclaim.create({
            data: {
              requestId: data.requestId,
              adminId: actor.userId,
              recipientId: id,
              kind: data.kind,
              value,
              reason: data.reason,
              balanceBefore: user.nimbBalance,
              balanceAfter:
                data.kind === "currency"
                  ? user.nimbBalance - data.amount
                  : user.nimbBalance,
              replacementUsername,
              checkpointId: point.id,
            },
          });
          return { record, replayed: false };
        },
        { timeout: 15000 },
      );
      if (!result.record)
        return reply.code(result.status ?? 409).send({ error: result.error });
      await notify(id);
      return {
        ok: true,
        replayed: result.replayed,
        balance: result.record.balanceAfter,
        replacementUsername: result.record.replacementUsername,
        checkpointId: result.record.checkpointId,
      };
    },
  );
}
