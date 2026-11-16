import { test } from "node:test";
import assert from "node:assert/strict";
const base = process.env.TEST_ADDRESSES_API_URL;
test(
  "profile aliases and numbers are visible only when the owner chooses them",
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
    const owner = await api("/register", "", {
      username: "addresses_owner",
      name: "Владелец",
      password: "addresses-test-password",
    });
    const member = await api("/register", "", {
      username: "addresses_member",
      name: "Участник",
      password: "addresses-test-password",
    });
    const id = member.data.user.id;
    assert.equal(owner.data.user.id, 1, "Use a fresh local database");
    for (const username of ["ladesev", "suvorovec", "+88804040888", "+666"])
      assert.equal(
        (await api(`/admin/users/${id}/username`, owner.cookie, { username }))
          .status,
        200,
      );
    assert.equal((await api(`/users/${id}/identifiers`)).status, 401);
    assert.deepEqual(
      (await api(`/users/${id}/identifiers`, owner.cookie)).data,
      { names: ["addresses_member"], numbers: [] },
    );
    assert.equal(
      (await api("/users?q=ladesev", owner.cookie)).data.users.length,
      0,
    );
    assert.equal(
      (
        await api(
          "/wallet/visibility",
          owner.cookie,
          { username: "ladesev", visible: true },
          "PATCH",
        )
      ).status,
      404,
      "Cannot publish another user collection",
    );
    for (const username of ["ladesev", "+88804040888"])
      assert.equal(
        (
          await api(
            "/wallet/visibility",
            member.cookie,
            { username, visible: true },
            "PATCH",
          )
        ).status,
        200,
      );
    assert.equal(
      (await api("/wallet/activate", member.cookie, { username: "+666" }))
        .status,
      200,
    );
    assert.deepEqual(
      (await api(`/users/${id}/identifiers`, owner.cookie)).data,
      {
        names: ["addresses_member", "ladesev"],
        numbers: ["+666", "+88804040888"],
      },
    );
    assert.equal(
      (await api("/users?q=ladesev", owner.cookie)).data.users[0].id,
      id,
    );
    const wallet = (await api("/wallet", member.cookie)).data;
    assert.ok(wallet.owned.find((n: any) => n.username === "ladesev").public);
    assert.equal(wallet.balance, 0, "Visibility is free");
    assert.equal(
      (
        await api(
          "/wallet/visibility",
          member.cookie,
          { username: "ladesev", visible: false },
          "PATCH",
        )
      ).status,
      200,
    );
    assert.deepEqual(
      (await api(`/users/${id}/identifiers`, owner.cookie)).data.names,
      ["addresses_member"],
    );
    assert.equal(
      (await api("/users?q=ladesev", owner.cookie)).data.users.length,
      0,
    );
    assert.ok(
      (await api("/wallet", member.cookie)).data.owned.some(
        (n: any) => n.username === "ladesev",
      ),
      "Hiding preserves ownership",
    );
  },
);
