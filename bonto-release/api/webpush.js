import * as webpush from "web-push";
import { createECDH } from "node:crypto";
export async function configureWebPush(db, env, origin) {
    let publicKey = env.VAPID_PUBLIC_KEY?.trim() || "";
    let privateKey = env.VAPID_PRIVATE_KEY?.trim() || "";
    if (Boolean(publicKey) !== Boolean(privateKey))
        throw new Error("Укажите оба VAPID-ключа или удалите оба, чтобы использовать сохранённую пару.");
    if (!publicKey) {
        const pair = await db.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext('nimb-web-push'),918)`;
            const existing = await tx.webPushConfig.findUnique({ where: { id: 1 } });
            if (existing)
                return existing;
            const keys = webpush.generateVAPIDKeys();
            return tx.webPushConfig.create({ data: { id: 1, ...keys } });
        });
        publicKey = pair.publicKey;
        privateKey = pair.privateKey;
    }
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (ecdh.getPublicKey().toString("base64url") !== publicKey)
        throw new Error("VAPID-ключи не составляют пару.");
    webpush.setVapidDetails(env.VAPID_SUBJECT ||
        (origin.startsWith("https://") ? origin : "mailto:admin@example.test"), publicKey, privateKey);
    return { publicKey };
}
export async function deliverPush(db, subscriptions, payload, send = webpush.sendNotification) {
    const result = await Promise.allSettled(subscriptions.map(async (sub) => {
        try {
            await send({
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
            }, JSON.stringify(payload), { TTL: 3600, urgency: "high", timeout: 8000 });
            return true;
        }
        catch (error) {
            const status = error.statusCode;
            if (status === 404 || status === 410)
                await db.pushSubscription.deleteMany({ where: { id: sub.id } });
            return false;
        }
    }));
    return {
        sent: result.filter((r) => r.status === "fulfilled" && r.value).length,
        failed: result.filter((r) => r.status === "rejected" || !r.value).length,
    };
}
