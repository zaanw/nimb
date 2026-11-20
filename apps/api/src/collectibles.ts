import type { Prisma, GiftEdition } from "@prisma/client";
import { randomInt } from "node:crypto";
import {
  gifts,
  giftBackdrops,
  giftSymbols,
  type giftTemplateIds,
} from "./catalog.js";
type Template = (typeof giftTemplateIds)[number];
const backdropIds = Object.keys(
  giftBackdrops,
) as (keyof typeof giftBackdrops)[];
const symbolIds = Object.keys(giftSymbols) as (keyof typeof giftSymbols)[];

export async function editionForGift(
  tx: Prisma.TransactionClient,
  originalGiftId: number,
  template: string,
) {
  const saved = await tx.giftEdition.findUnique({ where: { originalGiftId } });
  if (saved) {
    if (saved.template !== template)
      throw new Error("Collectible template cannot change");
    return saved;
  }
  const counter = await tx.giftCounter.upsert({
    where: { template },
    create: { template, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return tx.giftEdition.create({
    data: {
      originalGiftId,
      template,
      serialNumber: counter.lastNumber,
      backdrop: backdropIds[randomInt(backdropIds.length)],
      symbol: symbolIds[randomInt(symbolIds.length)],
    },
  });
}
export async function createCollectible(
  tx: Prisma.TransactionClient,
  ownerId: number,
  template: Template,
  senderId: number,
) {
  const gift = await tx.gift.create({
    data: { ownerId, template, events: { create: { senderId } } },
  });
  const edition = await editionForGift(tx, gift.id, template);
  return tx.gift.update({
    where: { id: gift.id },
    data: { editionId: edition.id },
    include: { edition: true },
  });
}
export function collectibleAppearance(edition: GiftEdition | null | undefined) {
  if (!edition) return { serialNumber: null, backdrop: null, symbol: null };
  const backdropId = edition.backdrop as keyof typeof giftBackdrops;
  const symbolId = edition.symbol as keyof typeof giftSymbols;
  return {
    serialNumber: edition.serialNumber,
    backdrop: {
      id: backdropId,
      ...(giftBackdrops[backdropId] || giftBackdrops.sapphire),
    },
    symbol: { id: symbolId, name: giftSymbols[symbolId] || "Stars" },
  };
}
export function collectibleView<
  T extends { template: string; edition?: GiftEdition | null },
>(gift: T) {
  const { edition, ...rest } = gift;
  return {
    ...rest,
    ...gifts[gift.template as Template],
    ...collectibleAppearance(edition),
  };
}
