import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { io } from "socket.io-client";
const base = process.env.TEST_NETWORK_API_URL;
const database = process.env.TEST_NETWORK_DATABASE_URL;
test(
  "owner can ban IPs and browser identities, terminate sessions, expire and revoke bans",
  { skip: !base || !database },
  async () => {
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(base!).hostname));
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(database!).hostname));
    const db = new PrismaClient({ datasourceUrl: database });
    let socket: ReturnType<typeof io> | undefined;
    function merge(old: string, headers: Headers) {
      const jar = new Map(
        old
          .split("; ")
          .filter(Boolean)
          .map((c) => {
            const index = c.indexOf("=");
            return [c.slice(0, index), c.slice(index + 1)];
          }),
      );
      for (const c of headers.getSetCookie()) {
        const pair = c.split(";")[0],
          index = pair.indexOf("=");
        jar.set(pair.slice(0, index), pair.slice(index + 1));
      }
      return [...jar].map(([k, v]) => k + "=" + v).join("; ");
    }
    async function api(
      path: string,
      cookie = "",
      body?: unknown,
      ip = "198.51.100.1",
      method = body === undefined ? "GET" : "POST",
    ) {
      const response = await fetch(base + "/api" + path, {
        method,
        headers: {
          Origin: base!,
          Cookie: cookie,
          "X-Forwarded-For": ip,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        data: (await response.json()) as any,
        cookie: merge(cookie, response.headers),
        headers: response.headers,
      };
    }
    try {
      const owner = await api("/register", "", {
        username: "network_owner",
        name: "Владелец",
        password: "network-local-password",
      });
      const user = await api(
        "/register",
        "",
        {
          username: "network_member",
          name: "Участник",
          password: "network-local-password",
        },
        "203.0.113.10",
      );
      const admin = await api(
        "/register",
        "",
        {
          username: "network_admin",
          name: "Администратор",
          password: "network-local-password",
        },
        "198.51.100.3",
      );
      assert.equal(owner.data.user.id, 1, "Fresh isolated database required");
      assert.equal(user.status, 200);
      assert.equal(admin.data.user.id, 3);
      assert.ok(
        user.cookie.includes("nimb_session=") &&
          user.cookie.includes("nimb_device="),
      );
      assert.ok(
        user.headers
          .getSetCookie()
          .some((v) => v.startsWith("nimb_device=") && v.includes("HttpOnly")),
      );
      assert.equal(
        (await api("/admin/users/2/network", user.cookie)).status,
        403,
      );
      assert.equal(
        (await api("/admin/users/2/network", admin.cookie)).status,
        403,
      );
      assert.equal((await api("/admin/network/status")).status, 401);
      const info = await api("/admin/users/2/network", owner.cookie);
      assert.equal(info.status, 200);
      assert.ok(info.data.devices.some((d: any) => d.ip === "203.0.113.10"));
      const device = info.data.devices[0].deviceHash;
      const rawDevice = user.cookie
        .split("; ")
        .find((v) => v.startsWith("nimb_device="))!
        .split("=")[1];
      assert.notEqual(
        device,
        rawDevice,
        "Only a hash is stored and shown to admin",
      );
      assert.equal(
        (
          await api("/admin/users/2/network/bans", admin.cookie, {
            kind: "device",
            value: device,
            reason: "Спам",
            hours: 24,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await api("/admin/users/1/network/bans", owner.cookie, {
            kind: "ip",
            value: "203.0.113.10",
            reason: "Спам",
            hours: 24,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await api("/admin/users/2/network/bans", owner.cookie, {
            kind: "ip",
            value: "172.17.0.1",
            reason: "Спам",
            hours: 24,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await api("/admin/users/2/network/bans", owner.cookie, {
            kind: "ip",
            value: "198.51.100.1",
            reason: "Спам",
            hours: 24,
          })
        ).status,
        400,
      );
      socket = io(base!, {
        transports: ["websocket"],
        extraHeaders: {
          Origin: base!,
          Cookie: user.cookie,
          "X-Forwarded-For": "203.0.113.10",
        },
      });
      await new Promise<void>((resolve, reject) => {
        socket!.once("connect", () => resolve());
        socket!.once("connect_error", reject);
        setTimeout(
          () => reject(new Error("Socket connection timeout")),
          7000,
        ).unref();
      });
      const disconnected = new Promise<void>((resolve, reject) => {
        socket!.once("disconnect", () => resolve());
        setTimeout(
          () => reject(new Error("Ban failed to disconnect socket")),
          7000,
        ).unref();
      });
      const banned = await api("/admin/users/2/network/bans", owner.cookie, {
        kind: "device",
        value: device,
        reason: "Повторный спам",
        hours: 24,
      });
      assert.equal(banned.status, 200, JSON.stringify(banned.data));
      await disconnected;
      assert.equal(
        (await api("/me", user.cookie, undefined, "203.0.113.11")).status,
        403,
        "Browser ban survives an IP change",
      );
      const credentials = {
        username: "network_member",
        password: "network-local-password",
      };
      assert.equal(
        (await api("/login", user.cookie, credentials, "203.0.113.11")).status,
        403,
      );
      assert.equal(
        (
          await api(
            "/register",
            user.cookie,
            {
              username: "blocked_signup",
              name: "Новый",
              password: "network-local-password",
            },
            "203.0.113.11",
          )
        ).status,
        403,
      );
      const otherBrowser = await api("/login", "", credentials, "203.0.113.10");
      assert.equal(
        otherBrowser.status,
        200,
        "Browser IDs are not hardware IDs: a separate browser can sign in",
      );
      assert.equal(
        (
          await api(
            `/admin/network/bans/${banned.data.ban.id}/revoke`,
            owner.cookie,
            {},
          )
        ).status,
        200,
      );
      assert.equal(
        (await api("/me", user.cookie, undefined, "203.0.113.10")).status,
        401,
        "Unbanning does not resurrect revoked sessions",
      );
      const relogin = await api(
        "/login",
        user.cookie,
        credentials,
        "203.0.113.10",
      );
      assert.equal(relogin.status, 200);
      const shared = await api(
        "/register",
        "",
        {
          username: "shared_network",
          name: "Общая сеть",
          password: "network-local-password",
        },
        "203.0.113.10",
      );
      assert.equal(shared.status, 200);
      const ipBan = await api("/admin/users/2/network/bans", owner.cookie, {
        kind: "ip",
        value: "203.0.113.10",
        reason: "Спам с адреса",
        hours: 1,
      });
      assert.equal(ipBan.status, 200);
      assert.equal(
        (await api("/me", relogin.cookie, undefined, "203.0.113.10")).status,
        403,
      );
      assert.equal(
        (await api("/me", shared.cookie, undefined, "203.0.113.10")).status,
        403,
        "All ordinary accounts on the banned IP are blocked",
      );
      assert.equal(
        (
          await api(
            "/register",
            "",
            {
              username: "blocked_ip",
              name: "Новый",
              password: "network-local-password",
            },
            "203.0.113.10",
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await api(
            "/login",
            "",
            { username: "network_owner", password: "network-local-password" },
            "203.0.113.10",
          )
        ).status,
        200,
        "Owner can recover access from a blocked address",
      );
      assert.equal(
        (await api("/login", relogin.cookie, credentials, "203.0.113.11"))
          .status,
        200,
        "An IP-only ban is limited to that address",
      );
      await db.networkBan.update({
        where: { id: ipBan.data.ban.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      assert.equal(
        (await api("/login", relogin.cookie, credentials, "203.0.113.10"))
          .status,
        200,
        "Expired bans stop applying",
      );
      const history = (await api("/admin/users/2/network", owner.cookie)).data
        .bans;
      assert.ok(history.some((b: any) => b.revokedAt));
      assert.ok(history.some((b: any) => !b.active && b.expiresAt));
    } finally {
      socket?.disconnect();
      await db.$disconnect();
    }
  },
);
