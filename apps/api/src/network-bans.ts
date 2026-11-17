import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { isIP } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export function normaliseIp(value: string | undefined) {
  if (!value || value.includes("%") || !isIP(value)) return null;
  if (isIP(value) === 4) return value;
  const ip = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = ip.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/);
  if (mapped) {
    const a = parseInt(mapped[1], 16),
      b = parseInt(mapped[2], 16);
    return [a >> 8, a & 255, b >> 8, b & 255].join(".");
  }
  return ip;
}
export function publicIp(ip: string | null) {
  const canonical = normaliseIp(ip || undefined);
  if (!canonical) return false;
  if (canonical !== ip) return publicIp(canonical);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  return ip !== "::" && ip !== "::1" && !/^(f[cd]|fe[89a-f]|ff)/i.test(ip);
}
export function resolveIp(
  peer: string | undefined,
  forwarded: string | undefined,
  trusted: (ip: string) => boolean,
) {
  const raw = normaliseIp(peer);
  if (!raw) return null;
  if (!trusted(raw) || !forwarded) return raw;
  const addresses = forwarded.split(",").map((v) => normaliseIp(v.trim()));
  if (addresses.length > 16 || addresses.some((v) => !v)) return raw;
  const chain = [...(addresses as string[]), raw];
  let index = chain.length - 1;
  while (index > 0 && trusted(chain[index])) index--;
  return chain[index];
}
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
type Context = { ip: string | null; deviceHash: string | null };
type Auth = (
  req: FastifyRequest,
  reply: FastifyReply,
) => Promise<{ userId: number } | null>;
export async function createNetworkGuard(
  db: PrismaClient,
  admins: Set<number>,
  production: boolean,
) {
  const environmentProxies = new Set(
    (process.env.TRUST_PROXY_IPS || "")
      .split(",")
      .map((v) => normaliseIp(v.trim()))
      .filter((ip): ip is string => !!ip),
  );
  let trusted = new Set(environmentProxies);
  let refreshAt = 0;
  async function refresh() {
    const values = await db.trustedProxy.findMany({ select: { ip: true } });
    trusted = new Set([...environmentProxies, ...values.map((v) => v.ip)]);
    refreshAt = Date.now() + 15000;
  }
  await refresh();
  async function refreshIfNeeded() {
    if (Date.now() > refreshAt) await refresh();
  }
  const isTrusted = (value: string) => {
    const ip = normaliseIp(value);
    return !!ip && trusted.has(ip);
  };
  function context(request: {
    headers: Record<string, unknown>;
    socket?: { remoteAddress?: string };
    raw?: { socket: { remoteAddress?: string } };
    cookies?: Record<string, string | undefined>;
  }): Context {
    const peer =
      request.raw?.socket.remoteAddress || request.socket?.remoteAddress;
    const rawCookie =
      request.cookies?.nimb_device ||
      String(request.headers.cookie || "")
        .split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("nimb_device="))
        ?.slice(12);
    return {
      ip: resolveIp(
        peer,
        typeof request.headers["x-forwarded-for"] === "string"
          ? request.headers["x-forwarded-for"]
          : undefined,
        isTrusted,
      ),
      deviceHash:
        rawCookie && /^[a-f0-9]{64}$/.test(rawCookie) ? hash(rawCookie) : null,
    };
  }
  async function denied(info: Context) {
    const conditions = [
      ...(info.ip ? [{ kind: "ip", value: info.ip }] : []),
      ...(info.deviceHash ? [{ kind: "device", value: info.deviceHash }] : []),
    ];
    if (!conditions.length) return false;
    return !!(await db.networkBan.findFirst({
      where: {
        revokedAt: null,
        AND: [
          { OR: conditions },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        ],
      },
      select: { id: true },
    }));
  }
  const newDeviceCookies = new WeakMap<object, string>();
  const observations = new Map<string, { stamp: number; identity: string }>();
  async function observe(
    userId: number,
    sessionId: string,
    info: Context,
    agent: string,
  ) {
    if (!info.deviceHash) return;
    const identity = (info.ip || "") + info.deviceHash;
    const previous = observations.get(sessionId);
    if (previous?.identity === identity && Date.now() - previous.stamp < 60000)
      return;
    const browser = /Firefox|FxiOS/.test(agent)
      ? "Firefox"
      : /Edg/.test(agent)
        ? "Edge"
        : /Chrome|CriOS/.test(agent)
          ? "Chrome"
          : /Safari/.test(agent)
            ? "Safari"
            : "Браузер";
    const system = /iPhone|iPad/.test(agent)
      ? "iOS"
      : /Android/.test(agent)
        ? "Android"
        : /Windows/.test(agent)
          ? "Windows"
          : /Mac/.test(agent)
            ? "macOS"
            : "Другое устройство";
    await db.$transaction([
      db.session.updateMany({
        where: { id: sessionId },
        data: { clientIp: info.ip, deviceHash: info.deviceHash },
      }),
      db.loginDevice.upsert({
        where: {
          userId_ip_deviceHash: {
            userId,
            ip: info.ip || "",
            deviceHash: info.deviceHash,
          },
        },
        create: {
          userId,
          ip: info.ip || "",
          deviceHash: info.deviceHash,
          label: browser + " · " + system,
        },
        update: { lastSeen: new Date(), label: browser + " · " + system },
      }),
    ]);
    observations.set(sessionId, { identity, stamp: Date.now() });
    if (observations.size > 5000)
      for (const key of [...observations.keys()].slice(0, 1000))
        observations.delete(key);
  }
  async function onRequest(req: FastifyRequest, reply: FastifyReply) {
    if (!req.url.startsWith("/api/") || req.url.split("?")[0] === "/api/health")
      return;
    await refreshIfNeeded();
    if (
      !req.cookies.nimb_device ||
      !/^[a-f0-9]{64}$/.test(req.cookies.nimb_device)
    ) {
      const token = randomBytes(32).toString("hex");
      req.cookies.nimb_device = token;
      newDeviceCookies.set(req, token);
    }
    if (
      ["/api/login", "/api/forgot-password", "/api/reset-password"].includes(
        req.url.split("?")[0],
      )
    )
      return;
    if (!(await denied(context(req)))) return;
    const token = req.cookies.nimb_session;
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const session = await db.session.findUnique({
        where: { id: hash(token) },
        select: { userId: true, expiresAt: true },
      });
      if (
        session &&
        session.expiresAt > new Date() &&
        admins.has(session.userId)
      )
        return;
    }
    return reply
      .code(403)
      .send({ error: "Доступ с этого подключения ограничен администратором." });
  }
  async function onSend(
    req: FastifyRequest,
    reply: FastifyReply,
    payload: any,
  ) {
    const token = newDeviceCookies.get(req);
    if (token)
      reply.setCookie("nimb_device", token, {
        httpOnly: true,
        secure: production,
        sameSite: "strict",
        path: "/",
        maxAge: 365 * 86400,
      });
    return payload;
  }
  function register(
    app: FastifyInstance,
    auth: Auth,
    disconnect: (kind: string, value: string) => Promise<void>,
  ) {
    async function owner(req: FastifyRequest, reply: FastifyReply) {
      const s = await auth(req, reply);
      if (!s) return null;
      if (s.userId !== 1) {
        reply
          .code(403)
          .send({ error: "IP и браузеры блокирует только владелец nimb" });
        return null;
      }
      return s;
    }
    app.get("/api/admin/network/status", async (req, reply) => {
      if (!(await owner(req, reply))) return;
      const peer = normaliseIp(req.raw.socket.remoteAddress);
      const forwarded =
        typeof req.headers["x-forwarded-for"] === "string"
          ? req.headers["x-forwarded-for"]
          : undefined;
      return {
        peer,
        clientIp: context(req).ip,
        publicClientIp: publicIp(context(req).ip),
        trusted: !!peer && isTrusted(peer),
        canTrust: !!peer && !publicIp(peer) && !!forwarded && !isTrusted(peer),
        proxies: await db.trustedProxy.findMany({
          select: { ip: true, createdAt: true },
        }),
      };
    });
    app.post("/api/admin/network/trust-proxy", async (req, reply) => {
      const s = await owner(req, reply);
      if (!s) return;
      const peer = normaliseIp(req.raw.socket.remoteAddress);
      if (!peer || publicIp(peer) || !req.headers["x-forwarded-for"])
        return reply.code(400).send({
          error:
            "Не найден внутренний прокси с заголовком адреса клиента. Доверенные внешние прокси задаются в TRUST_PROXY_IPS.",
        });
      await db.trustedProxy.upsert({
        where: { ip: peer },
        create: { ip: peer, createdById: s.userId },
        update: {},
      });
      await refresh();
      return { ok: true };
    });
    app.post("/api/admin/network/trust-proxy/revoke", async (req, reply) => {
      if (!(await owner(req, reply))) return;
      const { ip } = z.object({ ip: z.string().max(64) }).parse(req.body);
      const canonical = normaliseIp(ip);
      if (!canonical)
        return reply.code(400).send({ error: "Проверьте адрес прокси" });
      if (environmentProxies.has(canonical))
        return reply.code(400).send({
          error:
            "Этот адрес задан в TRUST_PROXY_IPS. Удалите его в настройках сервера.",
        });
      const result = await db.trustedProxy.deleteMany({
        where: { ip: canonical },
      });
      if (!result.count)
        return reply.code(404).send({ error: "Прокси не найден" });
      await refresh();
      return { ok: true };
    });
    app.get("/api/admin/users/:id/network", async (req, reply) => {
      if (!(await owner(req, reply))) return;
      const id = z.coerce
        .number()
        .int()
        .positive()
        .parse((req.params as { id: string }).id);
      const user = await db.user.findUnique({
        where: { id },
        select: { id: true, name: true, username: true },
      });
      if (!user)
        return reply.code(404).send({ error: "Пользователь не найден" });
      const devices = await db.loginDevice.findMany({
        where: { userId: id },
        orderBy: { lastSeen: "desc" },
        take: 30,
      });
      const bans = await db.networkBan.findMany({
        where: {
          OR: [
            { targetUserId: id },
            ...devices.flatMap((d) => [
              { kind: "device", value: d.deviceHash },
              ...(d.ip ? [{ kind: "ip", value: d.ip }] : []),
            ]),
          ],
        },
        orderBy: { id: "desc" },
        take: 50,
        select: {
          id: true,
          kind: true,
          value: true,
          reason: true,
          createdAt: true,
          expiresAt: true,
          revokedAt: true,
        },
      });
      return {
        user,
        isAdmin: admins.has(id),
        devices: devices.map((d) => ({ ...d, publicIp: publicIp(d.ip) })),
        bans: bans.map((b) => ({
          ...b,
          active: !b.revokedAt && (!b.expiresAt || b.expiresAt > new Date()),
        })),
      };
    });
    app.post("/api/admin/users/:id/network/bans", async (req, reply) => {
      const actor = await owner(req, reply);
      if (!actor) return;
      const id = z.coerce
        .number()
        .int()
        .positive()
        .parse((req.params as { id: string }).id);
      const { kind, value, reason, hours } = z
        .object({
          kind: z.enum(["ip", "device"]),
          value: z.string().max(128),
          reason: z.string().trim().min(3).max(500),
          hours: z.number().int().min(1).max(8760).nullable(),
        })
        .parse(req.body);
      if (admins.has(id))
        return reply
          .code(400)
          .send({ error: "Администратора блокировать нельзя" });
      if (!(await db.user.findUnique({ where: { id }, select: { id: true } })))
        return reply.code(404).send({ error: "Пользователь не найден" });
      const canonical = kind === "ip" ? normaliseIp(value) : value;
      if (!canonical || (kind === "ip" && !publicIp(canonical)))
        return reply.code(400).send({
          error:
            "Нельзя блокировать внутренние, локальные адреса или адрес прокси. Выберите публичный IP пользователя.",
        });
      if (
        kind === "device" &&
        !(await db.loginDevice.findFirst({
          where: { userId: id, deviceHash: value },
        }))
      )
        return reply.code(400).send({
          error: "Браузер не найден среди подключений этого пользователя",
        });
      const current = context(req);
      if (
        (kind === "ip" && canonical === current.ip) ||
        (kind === "device" && canonical === current.deviceHash)
      )
        return reply.code(400).send({
          error:
            "Нельзя заблокировать текущее подключение администратора. Если IP общий, выберите браузер пользователя.",
        });
      const protectedSession = await db.session.findFirst({
        where: {
          userId: { in: [...admins] },
          expiresAt: { gt: new Date() },
          ...(kind === "ip"
            ? { clientIp: canonical }
            : { deviceHash: canonical }),
        },
        select: { id: true },
      });
      if (protectedSession)
        return reply.code(400).send({
          error:
            "Это подключение используется администратором. Выберите другой адрес или браузер.",
        });
      const result = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${kind + ":" + canonical}),902)`;
        if (
          await tx.networkBan.findFirst({
            where: {
              kind,
              value: canonical,
              revokedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
          })
        )
          return null;
        const ban = await tx.networkBan.create({
          data: {
            kind,
            value: canonical,
            reason,
            createdById: actor.userId,
            targetUserId: id,
            expiresAt: hours ? new Date(Date.now() + hours * 3600000) : null,
          },
        });
        await tx.session.deleteMany({
          where: {
            userId: { notIn: [...admins] },
            ...(kind === "ip"
              ? { clientIp: canonical }
              : { deviceHash: canonical }),
          },
        });
        return ban;
      });
      if (!result)
        return reply.code(409).send({ error: "Блокировка уже действует" });
      await disconnect(kind, canonical);
      return { ok: true, ban: { id: result.id } };
    });
    app.post("/api/admin/network/bans/:id/revoke", async (req, reply) => {
      const actor = await owner(req, reply);
      if (!actor) return;
      const id = z.coerce
        .number()
        .int()
        .positive()
        .parse((req.params as { id: string }).id);
      const result = await db.networkBan.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date(), revokedById: actor.userId },
      });
      if (!result.count)
        return reply
          .code(404)
          .send({ error: "Блокировка не найдена или уже снята" });
      return { ok: true };
    });
  }
  return {
    isTrusted,
    context,
    denied,
    observe,
    onRequest,
    onSend,
    register,
    refreshIfNeeded,
  };
}
