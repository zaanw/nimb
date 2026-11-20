import { randomInt } from "node:crypto";
import { gifts, giftBackdrops, giftSymbols, } from "./catalog.js";
const backdropIds = Object.keys(giftBackdrops);
const symbolIds = Object.keys(giftSymbols);
export async function editionForGift(tx, originalGiftId, template) {
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
export async function createCollectible(tx, ownerId, template, senderId) {
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
export function collectibleAppearance(edition) {
    if (!edition)
        return { serialNumber: null, backdrop: null, symbol: null };
    const backdropId = edition.backdrop;
    const symbolId = edition.symbol;
    return {
        serialNumber: edition.serialNumber,
        backdrop: {
            id: backdropId,
            ...(giftBackdrops[backdropId] || giftBackdrops.sapphire),
        },
        symbol: { id: symbolId, name: giftSymbols[symbolId] || "Stars" },
    };
}
export function collectibleView(gift) {
    const { edition, ...rest } = gift;
    return {
        ...rest,
        ...gifts[gift.template],
        ...collectibleAppearance(edition),
    };
}
