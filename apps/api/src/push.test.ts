import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, createECDH } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import * as webpush from "web-push";
import argon2 from "argon2";
import dotenv from "dotenv";
dotenv.config({ path: new URL("../../../.env", import.meta.url).pathname });
test("configured Web Push validates endpoint and removes subscriptions on logout", async () => {
  const db = new PrismaClient();
  const suffix = randomBytes(6).toString("hex");
  const keys = webpush.generateVAPIDKeys();
  const port = 35000 + Math.floor(Math.random() * 20000);
  const origin = process.env.APP_ORIGIN || "http://localhost:5173";
  const base = `http://localhost:${port}`;
  const server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: "mailto:test@example.test",
    },
    stdio: "ignore",
  });
  let userId: number | undefined;
  let secondId: number | undefined;
  try {
    for (let i = 0; i < 100; i++) {
      try {
        await fetch(base + "/api/me");
        break;
      } catch {
        if (server.exitCode !== null)
          throw new Error("Test API exited before starting");
        await delay(100);
        if (i === 99) throw new Error("Test API did not start");
      }
    }
    const hash = await argon2.hash("test-password-secure", {
      type: argon2.argon2id,
    });
    const user = await db.user.create({
      data: {
        email: `push${suffix}@example.test`,
        username: `p${suffix}`,
        name: "Push test",
        passwordHash: hash,
        emailVerified: true,
      },
    });
    userId = user.id;
    const login = await fetch(base + "/api/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        password: "test-password-secure",
      }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const pub = await fetch(base + "/api/push/public-key", {
      headers: { Cookie: cookie },
    });
    assert.equal(pub.status, 200);
    assert.equal(((await pub.json()) as any).publicKey, keys.publicKey);
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const sub = {
      endpoint: `https://fcm.googleapis.com/fcm/send/test-${suffix}`,
      keys: {
        p256dh: ecdh.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
    };
    const post = async (body: unknown) =>
      fetch(base + "/api/push/subscriptions", {
        method: "POST",
        headers: {
          Origin: origin,
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    assert.equal(
      (await post({ ...sub, endpoint: "https://localhost/private" })).status,
      400,
    );
    assert.equal((await post(sub)).status, 200);
    assert.equal(
      await db.pushSubscription.count({ where: { endpoint: sub.endpoint } }),
      1,
    );
    const second = await db.user.create({
      data: {
        email: `other${suffix}@example.test`,
        username: `q${suffix}`,
        name: "Other test",
        passwordHash: hash,
        emailVerified: true,
      },
    });
    secondId = second.id;
    const secondLogin = await fetch(base + "/api/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: second.email,
        password: "test-password-secure",
      }),
    });
    assert.equal(secondLogin.status, 200);
    const secondCookie = secondLogin.headers.get("set-cookie")!.split(";")[0];
    const takeover = await fetch(base + "/api/push/subscriptions", {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: secondCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sub),
    });
    assert.equal(takeover.status, 409);
    assert.equal(
      (
        await fetch(base + "/api/logout", {
          method: "POST",
          headers: {
            Origin: origin,
            Cookie: cookie,
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      200,
    );
    assert.equal(
      await db.pushSubscription.count({ where: { endpoint: sub.endpoint } }),
      0,
    );
  } finally {
    server.kill();
    await db.user.deleteMany({
      where: {
        id: {
          in: [userId, secondId].filter((id): id is number => id !== undefined),
        },
      },
    });
    await db.$disconnect();
  }
});
