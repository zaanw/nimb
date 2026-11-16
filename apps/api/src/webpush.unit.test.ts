import { test } from "node:test";
import assert from "node:assert/strict";
import { deliverPush } from "./webpush.js";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("push transport removes expired subscriptions but keeps recoverable failures", async () => {
  const removed: number[] = [];
  const payloads: any[] = [];
  const db = {
    pushSubscription: {
      deleteMany: async ({ where }: { where: { id: number } }) => {
        removed.push(where.id);
      },
    },
  };
  const subscriptions = [1, 2, 3, 4].map((id) => ({
    id,
    endpoint: "https://fcm.googleapis.com/fcm/send/" + id,
    p256dh: "test",
    auth: "test",
  }));
  const send = async (sub: any, payload: any, options: any) => {
    payloads.push({ payload: JSON.parse(payload), options });
    const id = Number(sub.endpoint.split("/").at(-1));
    if (id > 1) throw { statusCode: id === 2 ? 410 : id === 3 ? 404 : 503 };
    return {} as any;
  };
  const result = await deliverPush(
    db as any,
    subscriptions,
    { title: "nimb", body: "Новое сообщение", chatId: 42, url: "/?chat=42" },
    send,
  );
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 3);
  assert.deepEqual(removed, [2, 3]);
  assert.equal(payloads[0].options.TTL, 3600);
  assert.equal(payloads[0].options.timeout, 8000);
  assert.equal(payloads[0].payload.chatId, 42);
});

function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  const notifications: any[] = [];
  const opened: string[] = [];
  const posted: any[] = [];
  let focused = false;
  let existing = false;
  const client = {
    url: "https://nimb.example/",
    postMessage: (data: any) => posted.push(data),
    focus: async () => {
      focused = true;
    },
  };
  const clients = {
    matchAll: async () => (existing ? [client] : []),
    openWindow: async (url: string) => {
      opened.push(url);
    },
  };
  const self = {
    location: { origin: "https://nimb.example" },
    registration: {
      showNotification: async (title: string, options: any) =>
        notifications.push({ title, options }),
    },
    addEventListener: (event: string, handler: any) =>
      (handlers[event] = handler),
    skipWaiting: () => {},
    clients,
  };
  runInNewContext(
    readFileSync(new URL("../../web/public/sw.js", import.meta.url), "utf8"),
    { self, clients, URL, caches: {}, fetch: () => {} },
  );
  async function fire(name: string, extra: any) {
    let pending: Promise<unknown> | undefined;
    handlers[name]({
      ...extra,
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
  }
  return {
    fire,
    notifications,
    opened,
    posted,
    setExisting: () => {
      existing = true;
    },
    focused: () => focused,
  };
}
test("service worker keeps text private and routes clicks to a trusted chat URL", async () => {
  const sw = worker();
  await sw.fire("push", {
    data: {
      json: () => ({
        chatId: 42,
        body: "SECRET MESSAGE",
        title: "unsafe",
        url: "https://evil.test/",
      }),
    },
  });
  assert.equal(sw.notifications[0].title, "nimb");
  assert.equal(sw.notifications[0].options.body, "Новое сообщение");
  assert.equal(sw.notifications[0].options.tag, "nimb-chat-42");
  await sw.fire("notificationclick", {
    notification: { data: sw.notifications[0].options.data, close: () => {} },
  });
  assert.deepEqual(sw.opened, ["/?chat=42"]);
  sw.setExisting();
  await sw.fire("notificationclick", {
    notification: {
      data: { chatId: 8, url: "https://evil.test" },
      close: () => {},
    },
  });
  assert.equal(sw.focused(), true);
  assert.equal(sw.posted[0].type, "OPEN_CHAT");
  assert.equal(sw.posted[0].chatId, 8);
  await sw.fire("push", { data: { json: () => ({ chatId: "not-a-number" }) } });
  assert.equal(sw.notifications[1].options.data.url, "/");
});
