import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { gifts, giftTemplateIds } from "./catalog.js";
import { createCollectible, collectibleView } from "./collectibles.js";
import { checkpoint } from "./checkpoints.js";

type Auth = (
  req: FastifyRequest,
  reply: FastifyReply,
) => Promise<{ userId: number } | null>;
function fail(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}
export function registerMarket(
  app: FastifyInstance,
  db: PrismaClient,
  auth: Auth,
  notify: (id: number) => Promise<void>,
) {
  app.get("/api/market/catalog", async (req, reply) => {
    if (!(await auth(req, reply))) return;
    const counters = await db.giftCounter.findMany();
    return {
      templates: Object.entries(gifts).map(([id, value]) => ({
        id,
        ...value,
        issued:
          counters.find((counter) => counter.template === id)?.lastNumber || 0,
      })),
    };
  });
  app.get("/api/market/collection", async (req, reply) => {
    const actor = await auth(req, reply);
    if (!actor) return;
    const { cursor } = z
      .object({ cursor: z.coerce.number().int().positive().optional() })
      .parse(req.query);
    const owned = await db.gift.findMany({
      where: { ownerId: actor.userId },
      orderBy: { id: "desc" },
      take: 31,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        edition: true,
        events: {
          take: 1,
          orderBy: { id: "asc" },
          include: { sender: { select: { name: true, username: true } } },
        },
      },
    });
    return {
      gifts: owned.slice(0, 30).map(({ events, ...gift }) => ({
        ...collectibleView(gift),
        sender: events[0]?.sender || null,
      })),
      nextCursor: owned.length > 30 ? owned[29].id : null,
    };
  });
  app.post(
    "/api/market/buy",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const actor = await auth(req, reply);
      if (!actor) return;
      const body = z
        .object({
          template: z.enum(giftTemplateIds),
          requestId: z.string().uuid(),
        })
        .parse(req.body);
      const result = await db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${actor.userId})`;
          const previous = await tx.giftPurchase.findUnique({
            where: { requestId: body.requestId },
            include: { gift: { include: { edition: true } } },
          });
          if (previous) {
            if (
              previous.userId !== actor.userId ||
              previous.template !== body.template
            )
              fail(409, "Этот запрос уже использован для другой покупки");
            const previousGift =
              previous.gift ||
              (await tx.gift.findUnique({
                where: { id: previous.originalGiftId },
                include: { edition: true },
              }));
            if (!previousGift || previousGift.ownerId !== actor.userId)
              fail(
                409,
                "Покупка уже выполнена. Подарок был удалён при откате статов; повторного списания не будет.",
              );
            const buyer = await tx.user.findUniqueOrThrow({
              where: { id: actor.userId },
              select: { nimbBalance: true },
            });
            return {
              gift: collectibleView(previousGift),
              balance: buyer.nimbBalance,
              replayed: true,
            };
          }
          const price = gifts[body.template].price;
          const buyer = await tx.user.findUniqueOrThrow({
            where: { id: actor.userId },
            select: { nimbBalance: true },
          });
          if (buyer.nimbBalance < price) fail(400, "Недостаточно нимбиков");
          await checkpoint(
            tx,
            actor.userId,
            actor.userId,
            "Перед покупкой: " + gifts[body.template].name,
          );
          const updated = await tx.user.update({
            where: { id: actor.userId },
            data: { nimbBalance: { decrement: price } },
            select: { nimbBalance: true },
          });
          const gift = await createCollectible(
            tx,
            actor.userId,
            body.template,
            actor.userId,
          );
          await tx.giftPurchase.create({
            data: {
              requestId: body.requestId,
              originalGiftId: gift.id,
              userId: actor.userId,
              template: body.template,
              giftId: gift.id,
              price,
            },
          });
          return {
            gift: collectibleView(gift),
            balance: updated.nimbBalance,
            replayed: false,
          };
        },
        { timeout: 15000 },
      );
      await notify(actor.userId);
      return result;
    },
  );
}
