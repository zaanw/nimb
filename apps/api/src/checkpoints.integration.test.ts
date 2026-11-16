import { test } from "node:test";
import assert from "node:assert/strict";
const base = process.env.TEST_CHECKPOINT_API_URL;
test(
  "owner can preview and reverse all stats safely, including undoing a restore",
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
    const owner = await api("/register", "", {
      username: "restore_owner",
      name: "Владелец",
      password: "restore-local-password",
    });
    const member = await api("/register", "", {
      username: "restore_member",
      name: "Участник",
      password: "restore-local-password",
    });
    const staff = await api("/register", "", {
      username: "restore_staff",
      name: "Администратор",
      password: "restore-local-password",
    });
    assert.equal(owner.data.user.id, 1, "Fresh local database required");
    const id = member.data.user.id;
    const prefix = `/admin/users/${id}`;
    for (const cookie of [member.cookie, staff.cookie]) {
      assert.equal((await api(prefix + "/checkpoints", cookie)).status, 403);
      assert.equal(
        (await api(prefix + "/checkpoints", cookie, { label: "bad" })).status,
        403,
      );
      assert.equal(
        (await api(prefix + "/stats/reset", cookie, {})).status,
        403,
      );
    }
    assert.equal((await api(prefix + "/checkpoints")).status, 401);
    const chat = (await api("/chats", member.cookie, { userId: 1 })).data.chat;
    await api(`/chats/${chat.id}/messages`, member.cookie, {
      text: "Не удалять при откате",
    });
    await api("/posts", member.cookie, { text: "Публикация сохраняется" });
    const point = (
      await api(prefix + "/checkpoints", owner.cookie, {
        label: "Исходные статы",
      })
    ).data.point;
    assert.equal(
      (await api(prefix + "/checkpoints", owner.cookie)).data.stats.messages,
      1,
    );
    assert.equal(
      (await api(prefix + "/checkpoints", owner.cookie)).data.stats.posts,
      1,
    );
    await api(prefix + "/currency", owner.cookie, { amount: 4000 });
    await api(prefix + "/gifts", owner.cookie, { template: "star" });
    await api(prefix + "/username", owner.cookie, { username: "77" });
    for (const kind of ["verified", "plus", "bug_hunter"])
      assert.equal(
        (await api(prefix + "/identity", owner.cookie, { kind, enabled: true }))
          .status,
        200,
      );
    assert.equal(
      (await api("/wallet/activate", member.cookie, { username: "77" })).status,
      200,
    );
    await api(
      "/me/appearance",
      member.cookie,
      { nameFont: "serif", nameEffect: "gold", profileAccent: "mint" },
      "PATCH",
    );
    const list = (await api(prefix + "/checkpoints", owner.cookie)).data.points;
    assert.ok(list.length >= 7, "Actions automatically create restore points");
    const preview = await api(
      prefix + `/checkpoints/${point.id}/preview`,
      owner.cookie,
      {},
    );
    assert.equal(preview.status, 200);
    assert.equal(preview.data.changes.balance.before, 4000);
    assert.equal(preview.data.changes.balance.after, 0);
    assert.equal(preview.data.changes.gifts.before, 1);
    assert.equal(preview.data.changes.plus.before, true);
    await api(prefix + "/currency", owner.cookie, { amount: 10 });
    assert.equal(
      (
        await api(prefix + `/checkpoints/${point.id}/restore`, owner.cookie, {
          token: preview.data.token,
        })
      ).status,
      409,
      "Stale preview cannot change newer stats",
    );
    assert.equal((await api("/wallet", member.cookie)).data.balance, 4010);
    const fresh = (
      await api(prefix + `/checkpoints/${point.id}/preview`, owner.cookie, {})
    ).data;
    const restored = await api(
      prefix + `/checkpoints/${point.id}/restore`,
      owner.cookie,
      { token: fresh.token },
    );
    assert.equal(restored.status, 200, JSON.stringify(restored.data));
    const wallet = (await api("/wallet", member.cookie)).data;
    assert.equal(wallet.balance, 0);
    assert.equal(wallet.username, "restore_member");
    assert.equal(wallet.owned.length, 0);
    assert.equal(
      (await api(`/users/${id}/gifts`, owner.cookie)).data.gifts.length,
      0,
    );
    const user = (await api("/me", member.cookie)).data.user;
    assert.equal(user.verified, false);
    assert.equal(user.plus, false);
    assert.equal(user.nameFont, "default");
    assert.ok(
      !(await api(`/users/${id}/badges`, owner.cookie)).data.badges.some(
        (b: any) => b.id === "bug_hunter",
      ),
    );
    const backup = restored.data.backupId;
    const undo = (
      await api(prefix + `/checkpoints/${backup}/preview`, owner.cookie, {})
    ).data;
    assert.equal(
      (
        await api(prefix + `/checkpoints/${backup}/restore`, owner.cookie, {
          token: undo.token,
        })
      ).status,
      200,
    );
    assert.equal((await api("/wallet", member.cookie)).data.balance, 4010);
    assert.equal((await api("/wallet", member.cookie)).data.username, "77");
    assert.equal(
      (await api(`/users/${id}/gifts`, owner.cookie)).data.gifts.length,
      1,
    );
    assert.equal((await api("/me", member.cookie)).data.user.nameFont, "serif");
    assert.equal(
      (await api(prefix + "/stats/reset", owner.cookie, {})).status,
      200,
    );
    assert.equal(
      (await api(prefix + "/checkpoints", owner.cookie)).data.stats.messages,
      0,
    );
    assert.equal(
      (await api(`/chats/${chat.id}/messages`, member.cookie)).data.messages[0]
        .text,
      "Не удалять при откате",
    );
    assert.equal((await api("/posts", member.cookie)).data.posts.length, 1);
    const resetBackup = (await api(prefix + "/checkpoints", owner.cookie)).data
      .points[0];
    const resetPreview = (
      await api(
        prefix + `/checkpoints/${resetBackup.id}/preview`,
        owner.cookie,
        {},
      )
    ).data;
    assert.equal(
      (
        await api(
          prefix + `/checkpoints/${resetBackup.id}/restore`,
          owner.cookie,
          { token: resetPreview.token },
        )
      ).status,
      200,
    );
    assert.equal(
      (await api(prefix + "/checkpoints", owner.cookie)).data.stats.messages,
      1,
    );
    const paid = await api("/wallet/buy", member.cookie, {
      username: "nova_alias",
    });
    assert.equal(paid.status, 200);
    const beforePurchase = (
      await api(prefix + "/checkpoints", owner.cookie)
    ).data.points.find((p: any) => p.label === "Перед покупкой nova_alias");
    assert.ok(beforePurchase);
    const paidPreview = (
      await api(
        prefix + `/checkpoints/${beforePurchase.id}/preview`,
        owner.cookie,
        {},
      )
    ).data;
    assert.equal(
      (
        await api(
          prefix + `/checkpoints/${beforePurchase.id}/restore`,
          owner.cookie,
          { token: paidPreview.token },
        )
      ).status,
      200,
    );
    assert.equal((await api("/wallet", member.cookie)).data.balance, 4010);
    assert.equal((await api("/wallet", member.cookie)).data.username, "77");
    // Releasing an ordinary username allows registration, but restore never steals it back.
    const taken = await api("/register", "", {
      username: "restore_member",
      name: "Новый владелец имени",
      password: "restore-local-password",
    });
    assert.equal(taken.status, 200);
    const conflictPreview = (
      await api(prefix + `/checkpoints/${point.id}/preview`, owner.cookie, {})
    ).data;
    assert.equal(
      (
        await api(prefix + `/checkpoints/${point.id}/restore`, owner.cookie, {
          token: conflictPreview.token,
        })
      ).status,
      409,
    );
    assert.equal((await api("/wallet", member.cookie)).data.balance, 4010);
    assert.equal(
      (await api("/admin/users/" + taken.data.user.id, owner.cookie)).data.user
        .username,
      "restore_member",
    );
    const zero = (
      await api(prefix + "/checkpoints/reset-all", owner.cookie, {})
    ).data.point;
    assert.equal(
      (await api("/wallet", member.cookie)).data.balance,
      4010,
      "Preparing reset never changes actual stats",
    );
    const zeroPreview = (
      await api(prefix + `/checkpoints/${zero.id}/preview`, owner.cookie, {})
    ).data;
    const zeroApplied = await api(
      prefix + `/checkpoints/${zero.id}/restore`,
      owner.cookie,
      { token: zeroPreview.token },
    );
    assert.equal(zeroApplied.status, 200);
    assert.equal((await api("/wallet", member.cookie)).data.balance, 0);
    assert.equal((await api("/wallet", member.cookie)).data.owned.length, 0);
    assert.equal((await api("/me", member.cookie)).data.user.plus, false);
    assert.equal(
      (await api(`/users/${id}/gifts`, owner.cookie)).data.gifts.length,
      0,
    );
    assert.equal(
      (await api(prefix + "/checkpoints", owner.cookie)).data.stats.messages,
      0,
    );
    assert.equal(
      (await api(`/chats/${chat.id}/messages`, member.cookie)).data.messages
        .length,
      1,
    );
    const unzero = (
      await api(
        prefix + `/checkpoints/${zeroApplied.data.backupId}/preview`,
        owner.cookie,
        {},
      )
    ).data;
    assert.equal(
      (
        await api(
          prefix + `/checkpoints/${zeroApplied.data.backupId}/restore`,
          owner.cookie,
          { token: unzero.token },
        )
      ).status,
      200,
    );
    assert.equal((await api("/wallet", member.cookie)).data.balance, 4010);
    assert.ok(
      (await api("/admin/activity", owner.cookie)).data.events.some(
        (e: any) => e.label === "Откат статов",
      ),
    );
  },
);
