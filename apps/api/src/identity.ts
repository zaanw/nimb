import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { badges } from "./catalog.js";

export const identitySelect = {
  verified: true,
  plus: true,
  nameFont: true,
  nameEffect: true,
  profileAccent: true,
  collectibleNumber: true,
} as const;
export const collectibleName = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/^@/, ""))
  .pipe(
    z
      .string()
      .regex(/^(?:[1-9][0-9]{0,5}|[a-z][a-z0-9_]{2,23}|\+[1-9][0-9]{2,11})$/),
  );
export function collectiblePrice(name: string) {
  if (name.startsWith("+"))
    return name.length <= 4 ? 10000 : name.length <= 7 ? 5000 : 1000;
  if (/^[0-9]+$/.test(name))
    return name.length === 1 ? 10000 : name.length === 2 ? 5000 : 1000;
  return name.length === 3 ? 3000 : name.length === 4 ? 2000 : 1000;
}
// The same name lock is used by registration, purchases, activation and grants.
// It protects ownership across User and UsernamePurchase, including inactive names.
export async function lockName(tx: Prisma.TransactionClient, name: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${name}), 841)`;
}
type Auth = (
  req: FastifyRequest,
  reply: FastifyReply,
) => Promise<{ userId: number } | null>;
export function registerIdentity(
  app: FastifyInstance,
  db: PrismaClient,
  auth: Auth,
  announce: (id: number) => Promise<void>,
) {
  app.post("/api/admin/users/:id/identity", async (req, reply) => {
    const actor = await auth(req, reply);
    if (!actor) return;
    if (actor.userId !== 1)
      return reply
        .code(403)
        .send({
          error: "Значки, верификацию и Plus выдаёт только владелец nimb",
        });
    const id = z.coerce
      .number()
      .int()
      .positive()
      .parse((req.params as { id: string }).id);
    const { kind, enabled } = z
      .object({
        kind: z.enum([
          "verified",
          "plus",
          "bug_hunter",
          "nimb_team",
          "beta_tester",
        ]),
        enabled: z.boolean(),
      })
      .parse(req.body);
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${id})`;
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) return false;
      if (kind === "verified" || kind === "plus") {
        await tx.user.update({
          where: { id },
          data: {
            [kind]: enabled,
            ...(kind === "plus" && !enabled && id !== 1
              ? {
                  nameFont: "default",
                  nameEffect: "none",
                  profileAccent: "gold",
                }
              : {}),
          },
        });
      }
      if (kind !== "verified") {
        if (enabled)
          await tx.badgeAward.upsert({
            where: { userId_badge: { userId: id, badge: kind } },
            create: { userId: id, badge: kind },
            update: {},
          });
        else
          await tx.badgeAward.deleteMany({
            where: { userId: id, badge: kind },
          });
      }
      await tx.identityGrant.create({
        data: { recipientId: id, adminId: actor.userId, kind, enabled },
      });
      return true;
    });
    if (!result)
      return reply.code(404).send({ error: "Пользователь не найден" });
    await announce(id);
    return { ok: true };
  });
  app.get("/api/admin/users/:id/identity", async (req, reply) => {
    const actor = await auth(req, reply);
    if (!actor) return;
    if (actor.userId !== 1)
      return reply.code(403).send({ error: "Доступ только владельцу nimb" });
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
        ...identitySelect,
        badges: { select: { badge: true } },
      },
    });
    if (!user) return reply.code(404).send({ error: "Пользователь не найден" });
    const history = await db.identityGrant.findMany({
      where: { recipientId: id },
      orderBy: { id: "desc" },
      take: 15,
      select: { id: true, kind: true, enabled: true, createdAt: true },
    });
    return {
      user,
      history,
      catalog: Object.entries(badges)
        .filter(([id]) =>
          ["bug_hunter", "nimb_team", "beta_tester", "plus"].includes(id),
        )
        .map(([id, badge]) => ({ id, ...badge })),
    };
  });
  app.patch("/api/me/appearance", async (req, reply) => {
    const actor = await auth(req, reply);
    if (!actor) return;
    const data = z
      .object({
        nameFont: z.enum(["default", "inter", "rubik", "serif", "mono"]),
        nameEffect: z.enum(["none", "gold", "aurora", "rainbow"]),
        profileAccent: z.enum(["gold", "violet", "ocean", "rose", "mint"]),
      })
      .parse(req.body);
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${actor.userId})`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
      });
      if (actor.userId !== 1 && !user.plus) return false;
      if (actor.userId !== 1 && data.nameEffect === "rainbow") return false;
      await tx.user.update({ where: { id: actor.userId }, data });
      return true;
    });
    if (!result)
      return reply
        .code(403)
        .send({
          error:
            "Для персонализации нужен nimb Plus. Радужное имя доступно владельцу.",
        });
    await announce(actor.userId);
    return { ok: true };
  });
}
