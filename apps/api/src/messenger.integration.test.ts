import { test } from "node:test";
import assert from "node:assert/strict";
const base = process.env.TEST_MESSENGER_API_URL;
test(
  "personal chat preferences and saved messages stay private and enforce membership",
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
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return {
        status: res.status,
        data: (await res.json()) as any,
        cookie: res.headers.get("set-cookie")?.split(";")[0] || cookie,
      };
    }
    const people = [];
    for (const username of ["sender", "recipient", "outsider"])
      people.push(
        await api("/register", "", {
          username,
          name: username,
          password: "messenger-local-password",
        }),
      );
    const [a, b, c] = people;
    const chat = await api("/chats", a.cookie, { userId: b.data.user.id });
    assert.equal(chat.status, 200);
    const chatId = chat.data.chat.id;
    assert.equal(
      (
        await api(
          `/chats/${chatId}/preferences`,
          c.cookie,
          { archived: true },
          "PATCH",
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await api(
          `/chats/${chatId}/preferences`,
          "",
          { archived: true },
          "PATCH",
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await api(
          `/chats/${chatId}/preferences`,
          a.cookie,
          { archived: true, chatPinned: true },
          "PATCH",
        )
      ).status,
      200,
    );
    const mine = (await api("/chats", a.cookie)).data.chats[0];
    assert.equal(
      mine.members.find((m: any) => m.userId === a.data.user.id).archived,
      true,
    );
    const theirs = (await api("/chats", b.cookie)).data.chats[0];
    assert.equal(
      theirs.members.find((m: any) => m.userId === a.data.user.id).archived,
      undefined,
    );
    assert.equal(
      theirs.members.find((m: any) => m.userId === b.data.user.id).archived,
      false,
    );
    assert.equal(
      (
        await api(
          `/chats/${chatId}/preferences`,
          a.cookie,
          { archived: false },
          "PATCH",
        )
      ).status,
      200,
    );
    const sent = await api(`/chats/${chatId}/messages`, a.cookie, {
      text: "Важный адрес встречи",
    });
    assert.equal(sent.status, 200);
    const messageId = sent.data.message.id;
    assert.equal(
      (
        await api(
          `/messages/${messageId}/saved`,
          c.cookie,
          { saved: true },
          "PUT",
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await api(
          `/messages/${messageId}/saved`,
          a.cookie,
          { saved: true },
          "PUT",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await api(
          `/messages/${messageId}/saved`,
          a.cookie,
          { saved: true },
          "PUT",
        )
      ).status,
      200,
    );
    assert.equal(
      (await api("/saved", a.cookie)).data.items.length,
      1,
      "Saving twice is idempotent",
    );
    assert.equal(
      (await api("/saved", b.cookie)).data.items.length,
      0,
      "Bookmarks are personal",
    );
    const history = (await api(`/chats/${chatId}/messages`, a.cookie)).data
      .messages;
    assert.equal(history[0].saved, true);
    assert.equal(history[0].savedBy, undefined);
    assert.equal(
      (await api(`/chats/${chatId}/messages`, b.cookie)).data.messages[0].saved,
      false,
    );
    assert.equal(
      (await api("/saved?q=несуществующее", a.cookie)).data.items.length,
      0,
    );
    assert.equal(
      (await api("/saved?q=адрес", a.cookie)).data.items[0].message.id,
      messageId,
    );
    assert.equal(
      (
        await api(
          `/messages/${messageId}/saved`,
          a.cookie,
          { saved: false },
          "PUT",
        )
      ).status,
      200,
    );
    assert.equal((await api("/saved", a.cookie)).data.items.length, 0);
    await api(`/messages/${messageId}/saved`, a.cookie, { saved: true }, "PUT");
    assert.equal(
      (await api(`/messages/${messageId}`, a.cookie, undefined, "DELETE"))
        .status,
      200,
    );
    assert.equal(
      (await api("/saved", a.cookie)).data.items.length,
      0,
      "Deleted messages are removed from bookmarks",
    );
  },
);
