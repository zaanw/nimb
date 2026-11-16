import { test } from "node:test";
import assert from "node:assert/strict";

// Fresh local database only. The additional administrator has ID 3.
const base = process.env.TEST_IDENTITY_API_URL;
test(
  "owner awards, Plus revocation, collectible ownership and atomic payments",
  { skip: !base },
  async () => {
    assert.ok(["127.0.0.1", "localhost"].includes(new URL(base!).hostname));
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
      username: "identity_owner",
      name: "Владелец",
      password: "owner-local-test-password",
    });
    const member = await api("/register", "", {
      username: "identity_member",
      name: "Тестер",
      password: "member-local-test-password",
    });
    const staff = await api("/register", "", {
      username: "identity_staff",
      name: "Команда",
      password: "staff-local-test-password",
    });
    assert.equal(owner.data.user.id, 1, "Use a fresh isolated database");
    assert.equal(member.data.user.id, 2);
    assert.equal(staff.data.user.id, 3);
    const award = { kind: "verified", enabled: true };
    assert.equal((await api("/admin/users/2/identity", "", award)).status, 401);
    for (const actor of [member, staff]) {
      assert.equal(
        (await api("/admin/users/2/identity", actor.cookie, award)).status,
        403,
      );
      assert.equal(
        (await api("/admin/users/2/identity", actor.cookie)).status,
        403,
      );
    }
    const appearance = {
      nameFont: "serif",
      nameEffect: "aurora",
      profileAccent: "violet",
    };
    assert.equal(
      (await api("/me/appearance", member.cookie, appearance, "PATCH")).status,
      403,
    );
    for (const kind of [
      "bug_hunter",
      "nimb_team",
      "beta_tester",
      "verified",
      "plus",
    ])
      assert.equal(
        (
          await api("/admin/users/2/identity", owner.cookie, {
            kind,
            enabled: true,
          })
        ).status,
        200,
        kind,
      );
    const publicProfile = (await api("/users/2", staff.cookie)).data.user;
    assert.equal(publicProfile.verified, true);
    assert.equal(publicProfile.plus, true);
    assert.equal(publicProfile.passwordHash, undefined);
    const badgeList = (await api("/users/2/badges", staff.cookie)).data.badges;
    for (const id of ["bug_hunter", "nimb_team", "beta_tester", "plus"])
      assert.ok(badgeList.some((b: any) => b.id === id));
    assert.equal(
      (await api("/me/appearance", member.cookie, appearance, "PATCH")).status,
      200,
    );
    assert.equal(
      (
        await api(
          "/me/appearance",
          member.cookie,
          { ...appearance, nameEffect: "rainbow" },
          "PATCH",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await api(
          "/me/appearance",
          owner.cookie,
          { ...appearance, nameEffect: "rainbow" },
          "PATCH",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await api(
          "/me/appearance",
          owner.cookie,
          { ...appearance, nameFont: "url(evil)" },
          "PATCH",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await api("/admin/users/2/identity", owner.cookie, {
          kind: "plus",
          enabled: false,
        })
      ).status,
      200,
    );
    const revoked = (await api("/me", member.cookie)).data.user;
    assert.equal(revoked.plus, false);
    assert.equal(revoked.nameFont, "default");
    assert.equal(revoked.nameEffect, "none");
    assert.equal(
      (await api("/me/appearance", member.cookie, appearance, "PATCH")).status,
      403,
    );
    assert.equal(
      (await api("/users/2/badges", owner.cookie)).data.badges.some(
        (b: any) => b.id === "plus",
      ),
      false,
    );
    assert.equal(
      (
        await api("/admin/users/2/identity", owner.cookie, {
          kind: "bug_hunter",
          enabled: false,
        })
      ).status,
      200,
    );
    assert.equal(
      (await api("/admin/users/2/identity", owner.cookie)).data.history.length,
      7,
    );
    assert.equal(
      (await api("/users/2/badges", owner.cookie)).data.badges.some(
        (b: any) => b.id === "bug_hunter",
      ),
      false,
    );

    for (const id of [1, 2])
      assert.equal(
        (
          await api(`/admin/users/${id}/currency`, owner.cookie, {
            amount: 40000,
          })
        ).status,
        200,
      );
    assert.equal(
      (await api("/wallet/check?username=NovaLine", member.cookie)).data
        .username,
      "novaline",
    );
    assert.equal(
      (await api("/wallet/buy", member.cookie, { username: "NovaLine" }))
        .status,
      200,
    );
    assert.equal(
      (await api("/wallet/buy", member.cookie, { username: "zenith" })).status,
      200,
    );
    assert.equal((await api("/wallet", member.cookie)).data.balance, 38000);
    const reservedRegistration = await api("/register", "", {
      username: "novaline",
      name: "Попытка",
      password: "reservation-local-password",
    });
    assert.equal(
      reservedRegistration.status,
      409,
      "Inactive purchased letter names cannot be registered",
    );
    assert.equal(
      (await api("/wallet/activate", staff.cookie, { username: "novaline" }))
        .status,
      404,
    );
    assert.equal(
      (await api("/wallet/activate", member.cookie, { username: "novaline" }))
        .status,
      200,
    );
    assert.equal(
      (await api("/wallet/buy", member.cookie, { username: "+666" })).status,
      200,
    );
    const numberWallet = (await api("/wallet", member.cookie)).data;
    assert.equal(numberWallet.username, "novaline");
    assert.equal(numberWallet.collectibleNumber, "+666");
    assert.equal(numberWallet.balance, 28000);
    assert.equal(
      (await api("/users?q=%2B666", owner.cookie)).data.users[0].id,
      2,
    );
    assert.equal(
      (await api("/wallet/buy", member.cookie, { username: "+666" })).status,
      409,
    );
    assert.equal(
      (await api("/wallet", member.cookie)).data.balance,
      28000,
      "Repeated purchase cannot debit again",
    );
    const race = await Promise.all([
      api("/wallet/buy", owner.cookie, { username: "+777" }),
      api("/wallet/buy", member.cookie, { username: "+777" }),
    ]);
    assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
    const balances = await Promise.all([
      api("/wallet", owner.cookie),
      api("/wallet", member.cookie),
    ]);
    assert.equal(
      balances.reduce((sum, r) => sum + r.data.balance, 0),
      58000,
      "Only the winning purchase is charged",
    );
    assert.equal(
      balances.filter((r) =>
        r.data.owned.some((n: any) => n.username === "+777"),
      ).length,
      1,
    );
    assert.equal(
      (await api("/wallet/buy", staff.cookie, { username: "+909" })).status,
      400,
    );
    assert.equal(
      (await api("/wallet/check?username=%2B909", owner.cookie)).data.available,
      true,
    );
    assert.equal(
      (await api("/wallet/buy", owner.cookie, { username: "+000" })).status,
      400,
    );
    assert.equal(
      (await api("/wallet/check?username=identity_staff", owner.cookie)).data
        .available,
      false,
    );
    assert.equal(
      (
        await api("/admin/users/2/username", owner.cookie, {
          username: "reserved_name",
        })
      ).status,
      200,
    );
    const bought = (await api("/wallet", member.cookie)).data;
    assert.ok(
      bought.owned.some(
        (n: any) => n.username === "reserved_name" && n.price === 0,
      ),
    );
    // A registration and a market claim racing for the same name must have one winner.
    const collision = await Promise.all([
      api("/admin/users/2/username", owner.cookie, {
        username: "shared_claim",
      }),
      api("/register", "", {
        username: "shared_claim",
        name: "Новый",
        password: "new-user-local-password",
      }),
    ]);
    assert.deepEqual(collision.map((r) => r.status).sort(), [200, 409]);
  },
);
