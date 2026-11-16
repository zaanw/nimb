import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
const base = process.env.TEST_WEBPUSH_API_URL;
test(
  "automatic push keys and device subscriptions are authenticated and stable",
  { skip: !base },
  async () => {
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(base!).hostname));
    async function api(
      path: string,
      cookie = "",
      body?: unknown,
      method = body === undefined ? "GET" : "POST",
    ) {
      const res = await fetch(base + "/api" + path, {
        method,
        headers: {
          Origin: base!,
          Cookie: cookie,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: res.status,
        data: (await res.json()) as any,
        cookie: res.headers.get("set-cookie")?.split(";")[0] || cookie,
      };
    }
    assert.equal((await api("/push/status")).status, 401);
    const owner = await api("/register", "", {
      username: "push_owner",
      name: "Владелец",
      password: "push-local-test-password",
    });
    const member = await api("/register", "", {
      username: "push_member",
      name: "Участник",
      password: "push-local-test-password",
    });
    assert.equal(
      (await api("/push/status", owner.cookie)).data.configured,
      true,
      "Keys require no environment variables",
    );
    assert.equal(
      (await api("/push/status", owner.cookie)).data.subscribed,
      false,
    );
    const pub = await api("/push/public-key", owner.cookie);
    assert.equal(pub.status, 200);
    assert.match(pub.data.publicKey, /^[A-Za-z0-9_-]{87}$/);
    assert.equal(pub.data.privateKey, undefined);
    assert.equal((await api("/push/test", owner.cookie, {})).status, 400);
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const sub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/nimb-local-test-only",
      keys: {
        p256dh: ecdh.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
    };
    assert.equal(
      (
        await api("/push/subscriptions", owner.cookie, {
          ...sub,
          endpoint: "https://localhost/private",
        })
      ).status,
      400,
    );
    assert.equal(
      (await api("/push/subscriptions", owner.cookie, sub)).status,
      200,
    );
    assert.equal(
      (await api("/push/status", owner.cookie)).data.subscribed,
      true,
    );
    assert.equal(
      (await api("/push/subscriptions", member.cookie, sub)).status,
      409,
    );
    assert.equal(
      (await api("/push/status", member.cookie)).data.subscribed,
      false,
    );
    const again = await api("/push/public-key", member.cookie);
    assert.equal(again.data.publicKey, pub.data.publicKey);
    assert.equal(
      (await api("/push/subscriptions", owner.cookie, undefined, "DELETE"))
        .status,
      200,
    );
    assert.equal(
      (await api("/push/status", owner.cookie)).data.subscribed,
      false,
    );
    assert.equal(
      (await api("/push/subscriptions", owner.cookie, sub)).status,
      200,
    );
    await api("/logout", owner.cookie, {});
    assert.equal((await api("/push/status", owner.cookie)).status, 401);
    assert.equal(
      (await api("/push/subscriptions", member.cookie, sub)).status,
      200,
      "Logout removes the previous account subscription",
    );
  },
);
