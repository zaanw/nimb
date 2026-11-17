import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const base = process.env.TEST_RECLAIMS_API_URL;
const database = process.env.TEST_RECLAIMS_DATABASE_URL;
test(
  "owner deductions and address revocation are atomic, audited, idempotent and reversible",
  { skip: !base || !database },
  async () => {
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(base!).hostname));
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(database!).hostname));
    const db = new PrismaClient({ datasourceUrl: database });
    async function api(path: string, cookie = "", body?: unknown) {
      const response = await fetch(base + "/api" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Origin: base!,
          Cookie: cookie,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        data: (await response.json()) as any,
        cookie:
          response.headers
            .getSetCookie()
            .map((v) => v.split(";")[0])
            .join("; ") || cookie,
      };
    }
    const reason = "Коррекция ошибочной выдачи";
    try {
      const owner = await api("/register", "", {
        username: "reclaim_owner",
        name: "Владелец",
        password: "reclaim-test-password",
      });
      const member = await api("/register", "", {
        username: "reclaim_member",
        name: "Участник",
        password: "reclaim-test-password",
      });
      const admin = await api("/register", "", {
        username: "reclaim_admin",
        name: "Другой администратор",
        password: "reclaim-test-password",
      });
      const other = await api("/register", "", {
        username: "reclaim_other",
        name: "Другой пользователь",
        password: "reclaim-test-password",
      });
      assert.equal(
        owner.data.user.id,
        1,
        "Use a fresh isolated local database",
      );
      assert.equal(member.data.user.id, 2);
      assert.equal(admin.data.user.id, 3, "Run with ADMIN_USER_IDS=3");
      const path = "/admin/users/2/reclaims";
      const subtract = (amount: number, expectedBalance: number) => ({
        kind: "currency",
        amount,
        expectedBalance,
        reason,
        requestId: randomUUID(),
      });
      for (const cookie of [member.cookie, admin.cookie]) {
        assert.equal((await api(path, cookie)).status, 403);
        assert.equal((await api(path, cookie, subtract(1, 1000))).status, 403);
      }
      assert.equal((await api(path)).status, 401);
      assert.equal(
        (await api("/admin/users/2/currency", owner.cookie, { amount: 1000 }))
          .status,
        200,
      );
      for (const amount of [0, -1, 1.5, 2147483648])
        assert.equal(
          (await api(path, owner.cookie, subtract(amount, 1000))).status,
          400,
        );
      assert.equal(
        (await api(path, owner.cookie, { ...subtract(1, 1000), reason: " " }))
          .status,
        400,
      );
      assert.equal(
        (await api(path, owner.cookie, subtract(1001, 1000))).status,
        400,
      );
      assert.equal(
        (await api(path, owner.cookie, subtract(1, 999))).status,
        409,
      );
      const count = await db.statCheckpoint.count({ where: { userId: 2 } });
      const body = subtract(400, 1000);
      const concurrent = await Promise.all([
        api(path, owner.cookie, body),
        api(path, owner.cookie, body),
      ]);
      assert.deepEqual(
        concurrent.map((r) => r.status),
        [200, 200],
      );
      assert.equal(concurrent.filter((r) => r.data.replayed).length, 1);
      assert.equal((await api("/wallet", member.cookie)).data.balance, 600);
      assert.equal(
        await db.statCheckpoint.count({ where: { userId: 2 } }),
        count + 1,
      );
      assert.equal(
        await db.assetReclaim.count({ where: { recipientId: 2 } }),
        1,
      );
      assert.equal(
        (await api(path, owner.cookie, { ...body, amount: 401 })).status,
        409,
      );
      assert.equal(
        (await api("/admin/users/4/reclaims", owner.cookie, body)).status,
        409,
      );
      const distinct = await Promise.all([
        api(path, owner.cookie, subtract(100, 600)),
        api(path, owner.cookie, subtract(100, 600)),
      ]);
      assert.deepEqual(distinct.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await api("/wallet", member.cookie)).data.balance, 500);
      assert.equal(
        (await api(path, owner.cookie, subtract(500, 500))).status,
        200,
      );
      assert.equal((await api("/wallet", member.cookie)).data.balance, 0);
      assert.equal((await api(path, owner.cookie, subtract(1, 0))).status, 400);

      async function grant(username: string, id = 2) {
        assert.equal(
          (await api(`/admin/users/${id}/username`, owner.cookie, { username }))
            .status,
          200,
        );
      }
      async function revoke(username: string) {
        return api(path, owner.cookie, {
          kind: "username",
          username,
          reason,
          requestId: randomUUID(),
        });
      }
      await grant("777");
      await grant("reserved_name");
      await grant("+666");
      await grant("someone_else", 4);
      assert.equal((await revoke("someone_else")).status, 404);
      assert.equal(
        (
          await db.usernamePurchase.findUniqueOrThrow({
            where: { username: "someone_else" },
          })
        ).ownerId,
        4,
      );
      assert.equal(
        (await api("/wallet/activate", member.cookie, { username: "777" }))
          .status,
        200,
      );
      const inactive = await revoke("reserved_name");
      assert.equal(inactive.status, 200);
      assert.equal(
        (await api("/wallet/check?username=reserved_name", member.cookie)).data
          .available,
        true,
      );
      assert.equal(
        (
          await api("/wallet/activate", member.cookie, {
            username: "reserved_name",
          })
        ).status,
        404,
      );
      const active = await revoke("777");
      assert.equal(active.status, 200);
      assert.match(active.data.replacementUsername, /^nimb_2_[0-9a-f]{8}$/);
      assert.equal(
        (await api("/wallet", member.cookie)).data.username,
        active.data.replacementUsername,
      );
      assert.equal((await revoke("777")).status, 404);
      assert.equal(
        (
          await api("/login", "", {
            username: active.data.replacementUsername,
            password: "reclaim-test-password",
          })
        ).status,
        200,
      );
      assert.equal(
        (await api("/wallet/check?username=777", member.cookie)).data.available,
        true,
      );
      await grant("777", 4);
      // Restoring a reclaimed address must still refuse a new owner's address.
      const preview = await api(
        `/admin/users/2/checkpoints/${active.data.checkpointId}/preview`,
        owner.cookie,
        {},
      );
      assert.equal(preview.status, 200);
      assert.equal(
        (
          await api(
            `/admin/users/2/checkpoints/${active.data.checkpointId}/restore`,
            owner.cookie,
            { token: preview.data.token },
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await db.usernamePurchase.findUniqueOrThrow({
            where: { username: "777" },
          })
        ).ownerId,
        4,
      );
      assert.equal(
        (await api("/wallet/activate", member.cookie, { username: "+666" }))
          .status,
        200,
      );
      const phone = await revoke("+666");
      assert.equal(phone.status, 200);
      assert.equal(
        (await api("/wallet", member.cookie)).data.collectibleNumber,
        null,
      );
      assert.equal(
        (await api("/wallet/check?username=%2B666", member.cookie)).data
          .available,
        true,
      );
      const beforeRestore = await api(
        `/admin/users/2/checkpoints/${phone.data.checkpointId}/preview`,
        owner.cookie,
        {},
      );
      assert.equal(beforeRestore.status, 200);
      assert.equal(
        (
          await api(
            `/admin/users/2/checkpoints/${phone.data.checkpointId}/restore`,
            owner.cookie,
            { token: beforeRestore.data.token },
          )
        ).status,
        200,
      );
      assert.equal(
        (await api("/wallet", member.cookie)).data.collectibleNumber,
        "+666",
      );
      // An ordinary primary login can also be reclaimed, without deleting the account.
      const primary = await api("/admin/users/4/reclaims", owner.cookie, {
        kind: "username",
        username: "reclaim_other",
        reason,
        requestId: randomUUID(),
      });
      assert.equal(primary.status, 200);
      assert.equal(
        (await api("/wallet", other.cookie)).data.username,
        primary.data.replacementUsername,
      );
      const snapshot = await api(path, owner.cookie);
      assert.equal(snapshot.data.history.length, 6);
      assert.ok(snapshot.data.history.every((r: any) => r.reason === reason));
      const events = (await api("/admin/activity?userId=2", owner.cookie)).data
        .events;
      assert.ok(
        events.some(
          (e: any) =>
            e.label === "Списание нимбиков" &&
            e.value === "−400" &&
            e.reason === reason,
        ),
      );
      assert.ok(
        events.some(
          (e: any) => e.label === "Отзыв номера" && e.value === "+666",
        ),
      );
      assert.ok(
        (await db.user.findUniqueOrThrow({ where: { id: 2 } })).nimbBalance >=
          0,
      );
    } finally {
      await db.$disconnect();
    }
  },
);
