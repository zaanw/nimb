import { test } from "node:test";
import assert from "node:assert/strict";

// Run against a fresh, isolated local database with ADMIN_USER_IDS=3.
// This test never uses the ordinary application database or a remote host.
const base = process.env.TEST_ADMIN_API_URL;
test(
  "admin grants, collisions, filters, history and access restrictions",
  { skip: !base },
  async () => {
    assert.ok(
      ["127.0.0.1", "localhost"].includes(new URL(base!).hostname),
      "Only a local test server is allowed",
    );
    async function api(path: string, cookie = "", body?: unknown) {
      const r = await fetch(base + "/api" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Origin: base!,
          Cookie: cookie,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: r.status,
        data: (await r.json()) as any,
        cookie: r.headers.get("set-cookie")?.split(";")[0] || cookie,
      };
    }
    const owner = await api("/register", "", {
      username: "admin_owner",
      name: "Владелец",
      password: "admin-test-password",
    });
    assert.equal(owner.status, 200);
    assert.equal(owner.data.user.id, 1, "Use a fresh, isolated database");
    const member = await api("/register", "", {
      username: "admin_member",
      name: "Участник",
      password: "member-test-password",
    });
    const extraAdmin = await api("/register", "", {
      username: "admin_colleague",
      name: "Администратор",
      password: "admin-test-password",
    });
    assert.equal(member.data.user.id, 2);
    assert.equal(extraAdmin.data.user.id, 3);
    for (const path of [
      "/admin/overview",
      "/admin/users",
      "/admin/users/1",
      "/admin/activity",
      "/admin/reports",
    ]) {
      assert.equal((await api(path, member.cookie)).status, 403, path);
      assert.equal((await api(path)).status, 401, path);
    }
    for (const [path, body] of [
      ["currency", { amount: 500 }],
      ["gifts", { template: "star" }],
      ["username", { username: "2" }],
    ] as const) {
      assert.equal(
        (await api("/admin/users/2/" + path, member.cookie, body)).status,
        403,
      );
    }
    assert.equal(
      (await api("/admin/users/2/currency", owner.cookie, { amount: -10 }))
        .status,
      400,
    );
    assert.equal(
      (await api("/admin/users/2/currency", owner.cookie, { amount: 1.5 }))
        .status,
      400,
    );
    assert.equal(
      (await api("/admin/users/2/currency", owner.cookie, { amount: 1000001 }))
        .status,
      400,
    );
    const credit = await api("/admin/users/2/currency", owner.cookie, {
      amount: 5000,
    });
    assert.equal(credit.status, 200);
    assert.equal(credit.data.balance, 5000);
    assert.equal(
      (await api("/admin/users/2/gifts", owner.cookie, { template: "diamond" }))
        .status,
      200,
    );
    assert.equal(
      (await api("/admin/users/2/username", owner.cookie, { username: "02" }))
        .status,
      400,
    );
    assert.equal(
      (
        await api("/admin/users/99999/username", owner.cookie, {
          username: "2",
        })
      ).status,
      404,
    );
    assert.equal(
      (await api("/admin/users/2/username", owner.cookie, { username: "2" }))
        .status,
      200,
    );
    const wallet = await api("/wallet", member.cookie);
    assert.equal(wallet.data.balance, 5000, "Admin grants must be free");
    assert.equal(
      wallet.data.username,
      "admin_member",
      "Issuing a name must preserve the current username",
    );
    assert.ok(
      wallet.data.owned.some((n: any) => n.username === "2" && n.price === 0),
    );
    assert.equal(
      (await api("/admin/users/1/username", owner.cookie, { username: "2" }))
        .status,
      409,
      "Cannot steal a reserved name",
    );
    assert.equal(
      (await api("/wallet/buy", owner.cookie, { username: "2" })).status,
      409,
    );
    const race = await Promise.all([
      api("/admin/users/1/username", owner.cookie, { username: "77" }),
      api("/admin/users/2/username", owner.cookie, { username: "77" }),
    ]);
    assert.deepEqual(
      race.map((r) => r.status).sort(),
      [200, 409],
      "Exactly one user owns a concurrently granted username",
    );
    assert.equal(
      (await api("/wallet/activate", member.cookie, { username: "2" })).status,
      200,
    );
    const detail = await api("/admin/users/2", owner.cookie);
    assert.equal(detail.data.user.username, "2");
    assert.equal(detail.data.user._count.gifts, 1);
    assert.equal(detail.data.user.isAdmin, false);
    assert.equal(detail.data.user.passwordHash, undefined);
    const page = await api("/admin/users?q=2", owner.cookie);
    assert.equal(page.data.total, 1);
    assert.equal(page.data.users[0].id, 2);
    assert.equal(page.data.pageSize, 20);
    const ownerDetail = await api("/admin/users/3", owner.cookie);
    assert.equal(ownerDetail.data.user.isAdmin, true);
    assert.equal(
      (
        await api("/admin/users/1/suspension", owner.cookie, {
          suspended: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api("/admin/users/3/suspension", owner.cookie, {
          suspended: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api("/admin/users/2/suspension", owner.cookie, {
          suspended: true,
        })
      ).status,
      200,
    );
    assert.equal((await api("/me", member.cookie)).status, 401);
    const restricted = await api("/admin/users?status=suspended", owner.cookie);
    assert.equal(restricted.data.total, 1);
    assert.equal(restricted.data.users[0].id, 2);
    assert.equal(
      (
        await api("/admin/users/2/suspension", owner.cookie, {
          suspended: false,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api("/login", "", {
          username: "2",
          password: "member-test-password",
        })
      ).status,
      200,
    );
    const history = await api("/admin/activity", owner.cookie);
    assert.equal(history.status, 200);
    assert.ok(
      history.data.events.some(
        (e: any) =>
          e.kind === "currency" && e.user.id === 2 && e.actor.id === 1,
      ),
    );
    assert.ok(
      history.data.events.some(
        (e: any) => e.kind === "gift" && e.value === "Astral Shard",
      ),
    );
    assert.ok(
      history.data.events.some(
        (e: any) =>
          e.kind === "username" &&
          e.value === "@2" &&
          e.actor.id === 1 &&
          e.label === "Выдача юзернейма",
      ),
    );
    const overview = await api("/admin/overview", owner.cookie);
    assert.equal(overview.data.users, 3);
    assert.equal(overview.data.totalBalance, 5000);
    assert.equal(overview.data.gifts, 1);
    const report = await api("/users/2/report", owner.cookie, {
      reason: "Проверка очереди жалоб",
    });
    assert.equal(report.status, 200);
    const reports = await api("/admin/reports", owner.cookie);
    assert.equal(reports.data.reports.length, 1);
    const id = reports.data.reports[0].id;
    assert.equal(
      (await api(`/admin/reports/${id}/resolve`, owner.cookie, {})).status,
      200,
    );
    assert.equal(
      (await api(`/admin/reports/${id}/resolve`, owner.cookie, {})).status,
      404,
    );
    assert.equal(
      (await api("/admin/overview", owner.cookie)).data.openReports,
      0,
    );
    const catalog = await api("/catalog/gifts", owner.cookie);
    assert.equal(catalog.status, 200);
    assert.equal(catalog.data.templates.length, 8);
    assert.equal(
      catalog.data.templates.find((gift: any) => gift.id === "pepe").name,
      "Plush Pepe",
    );
    assert.equal(
      catalog.data.templates.find((gift: any) => gift.id === "bear").name,
      "Toy Bear",
    );
    assert.equal(
      (await api("/admin/users/2/gifts", owner.cookie, { template: "pepe" }))
        .status,
      200,
    );
    assert.equal(
      (await api("/users/2/gifts", owner.cookie, { template: "bear" })).status,
      200,
    );
    assert.equal(
      (
        await api("/admin/users/2/gifts", owner.cookie, {
          template: "unknown_gift",
        })
      ).status,
      400,
    );
    const collection = await api("/users/2/gifts", owner.cookie);
    assert.ok(
      collection.data.gifts.some(
        (gift: any) => gift.template === "pepe" && gift.name === "Plush Pepe",
      ),
    );
    assert.ok(
      collection.data.gifts.some(
        (gift: any) => gift.template === "bear" && gift.name === "Toy Bear",
      ),
    );
    assert.ok(
      collection.data.gifts.some(
        (gift: any) =>
          gift.template === "diamond" && gift.name === "Astral Shard",
      ),
    );
  },
);
