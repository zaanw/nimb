import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_MARKET_API_URL;
test(
  "market purchases preserve serials and random traits; retries, races and rollbacks cannot duplicate gifts",
  { skip: !base },
  async () => {
    assert.ok(["127.0.0.1", "localhost"].includes(new URL(base!).hostname));
    async function api(
      path: string,
      cookie = "",
      body?: unknown,
      method?: string,
    ) {
      const r = await fetch(base + "/api" + path, {
        method: method || (body === undefined ? "GET" : "POST"),
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
      username: "market_owner",
      name: "Владелец",
      password: "market-owner-password",
    });
    const buyer = await api("/register", "", {
      username: "market_buyer",
      name: "Покупатель",
      password: "market-buyer-password",
    });
    const third = await api("/register", "", {
      username: "market_third",
      name: "Участник",
      password: "market-third-password",
    });
    assert.equal(owner.data.user.id, 1, "Use a fresh isolated database");
    assert.equal(buyer.data.user.id, 2);
    assert.equal(third.data.user.id, 3);
    assert.equal((await api("/market/catalog")).status, 401);
    assert.equal((await api("/market/collection")).status, 401);
    assert.equal(
      (
        await api("/market/buy", "", {
          template: "star",
          requestId: randomUUID(),
        })
      ).status,
      401,
    );
    const catalog = await api("/market/catalog", buyer.cookie);
    assert.equal(catalog.status, 200);
    assert.equal(catalog.data.templates.length, 8);
    assert.equal(
      catalog.data.templates.find((t: any) => t.id === "star").price,
      50,
    );
    assert.equal(
      (
        await api("/market/buy", buyer.cookie, {
          template: "missing",
          requestId: randomUUID(),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api("/market/buy", buyer.cookie, {
          template: "star",
          requestId: "not-a-uuid",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api("/market/buy", buyer.cookie, {
          template: "star",
          requestId: randomUUID(),
        })
      ).status,
      400,
    );
    await api("/admin/users/2/currency", owner.cookie, { amount: 125 });
    const key = randomUUID();
    const duplicate = await Promise.all([
      api("/market/buy", buyer.cookie, {
        template: "star",
        requestId: key,
        price: 0,
      }),
      api("/market/buy", buyer.cookie, { template: "star", requestId: key }),
    ]);
    assert.deepEqual(
      duplicate.map((r) => r.status),
      [200, 200],
    );
    assert.equal(duplicate[0].data.gift.id, duplicate[1].data.gift.id);
    assert.equal(duplicate.filter((r) => r.data.replayed).length, 1);
    assert.equal((await api("/wallet", buyer.cookie)).data.balance, 75);
    const minted = duplicate[0].data.gift;
    assert.equal(minted.serialNumber, 1);
    assert.equal(minted.ownerId, 2);
    assert.ok(
      [
        "sapphire",
        "amethyst",
        "emerald",
        "rose",
        "amber",
        "ocean",
        "graphite",
        "sunset",
      ].includes(minted.backdrop.id),
    );
    assert.ok(
      [
        "stars",
        "crowns",
        "hearts",
        "moons",
        "diamonds",
        "flowers",
        "lightning",
        "clovers",
      ].includes(minted.symbol.id),
    );
    assert.equal(
      (
        await api("/market/buy", third.cookie, {
          template: "star",
          requestId: key,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await api("/market/buy", buyer.cookie, {
          template: "heart",
          requestId: key,
        })
      ).status,
      409,
    );
    const race = await Promise.all([
      api("/market/buy", buyer.cookie, {
        template: "star",
        requestId: randomUUID(),
      }),
      api("/market/buy", buyer.cookie, {
        template: "star",
        requestId: randomUUID(),
      }),
    ]);
    assert.deepEqual(race.map((r) => r.status).sort(), [200, 400]);
    assert.equal((await api("/wallet", buyer.cookie)).data.balance, 25);
    const collection = (await api("/market/collection", buyer.cookie)).data
      .gifts;
    assert.equal(collection.length, 2);
    assert.equal(new Set(collection.map((g: any) => g.serialNumber)).size, 2);
    const traits = (g: any) => ({
      serialNumber: g.serialNumber,
      backdrop: g.backdrop,
      symbol: g.symbol,
    });
    assert.deepEqual(
      traits(collection.find((g: any) => g.id === minted.id)),
      traits(minted),
    );
    await api(
      `/gifts/${minted.id}/pin`,
      buyer.cookie,
      { pinned: true },
      "PATCH",
    );
    const profileGift = (
      await api("/users/2/gifts", buyer.cookie)
    ).data.gifts.find((g: any) => g.id === minted.id);
    assert.equal(profileGift.pinned, true);
    assert.deepEqual(traits(profileGift), traits(minted));
    // All issuing paths use the same per-collection sequence.
    await api("/admin/users/2/gifts", owner.cookie, { template: "heart" });
    await api("/users/2/gifts", owner.cookie, { template: "heart" });
    const hearts = (
      await api("/users/2/gifts", buyer.cookie)
    ).data.gifts.filter((g: any) => g.template === "heart");
    assert.deepEqual(hearts.map((g: any) => g.serialNumber).sort(), [1, 2]);
    assert.ok(hearts.every((g: any) => g.backdrop && g.symbol));
    await api("/admin/users/1/currency", owner.cookie, { amount: 3000 });
    const before = (
      await api("/admin/users/1/checkpoints", owner.cookie, {
        label: "Before mint",
      })
    ).data.point;
    const receipt = randomUUID();
    const pepe = await api("/market/buy", owner.cookie, {
      template: "pepe",
      requestId: receipt,
    });
    assert.equal(pepe.status, 200);
    const after = (
      await api("/admin/users/1/checkpoints", owner.cookie, {
        label: "After mint",
      })
    ).data.point;
    async function restore(point: { id: number }) {
      const preview = await api(
        `/admin/users/1/checkpoints/${point.id}/preview`,
        owner.cookie,
        {},
      );
      return api(
        `/admin/users/1/checkpoints/${point.id}/restore`,
        owner.cookie,
        { token: preview.data.token },
      );
    }
    assert.equal((await restore(before)).status, 200);
    assert.equal((await api("/wallet", owner.cookie)).data.balance, 3000);
    assert.equal(
      (
        await api("/market/buy", owner.cookie, {
          template: "pepe",
          requestId: receipt,
        })
      ).status,
      409,
    );
    assert.equal(
      (await api("/wallet", owner.cookie)).data.balance,
      3000,
      "A replay after rollback cannot debit again",
    );
    assert.equal((await restore(after)).status, 200);
    const restored = (
      await api("/users/1/gifts", owner.cookie)
    ).data.gifts.find((g: any) => g.id === pepe.data.gift.id);
    assert.deepEqual(
      traits(restored),
      traits(pepe.data.gift),
      "Recreating a rolled-back gift cannot reroll or renumber it",
    );
    const replayRestored = await api("/market/buy", owner.cookie, {
      template: "pepe",
      requestId: receipt,
    });
    assert.equal(replayRestored.status, 200);
    assert.equal(replayRestored.data.replayed, true);
    assert.equal(replayRestored.data.balance, 2000);
    const next = await api("/market/buy", owner.cookie, {
      template: "pepe",
      requestId: randomUUID(),
    });
    assert.equal(next.status, 200);
    assert.equal(next.data.gift.serialNumber, 2);
    assert.equal(
      (await api("/market/collection?cursor=bad", owner.cookie)).status,
      400,
    );
  },
);
