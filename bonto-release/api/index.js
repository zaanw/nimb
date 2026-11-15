import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../../.env', import.meta.url).pathname });
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import { randomBytes, createHash } from 'node:crypto';
import argon2 from 'argon2';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { createMailSender } from './mailer.js';
import multipart from '@fastify/multipart';
import { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import * as webpush from 'web-push';
import { z, ZodError } from 'zod';
import { gifts, badges } from './catalog.js';
import { isAllowedPushEndpoint, isAllowedSocialLink } from './policy.js';
const db = new PrismaClient();
const onlineUsers = new Map();
const app = Fastify({ logger: { serializers: { req(req) { return { method: req.method, url: req.url.split('?')[0], hostname: req.hostname, remoteAddress: req.ip }; } } }, bodyLimit: 32 * 1024 });
const origin = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173';
const production = process.env.NODE_ENV === 'production';
if (production) {
    const required = ['DATABASE_URL', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'];
    const missing = required.filter(key => !process.env[key]?.trim());
    if (!origin.startsWith('https://'))
        missing.push('APP_ORIGIN (HTTPS)');
    if (missing.length)
        throw new Error('Для запуска не заданы настройки: ' + missing.join(', '));
}
await app.register(cookie);
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 } });
await app.register(cors, { origin, credentials: true });
await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
app.addHook('onRequest', async (req, reply) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origin)
        return reply.code(403).send({ error: 'Недопустимый источник запроса' });
});
let pushReady = false;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    try {
        webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.test', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
        pushReady = true;
    }
    catch (error) {
        app.log.error(error, 'Неверные настройки VAPID');
    }
}
const bucket = process.env.S3_BUCKET || 'nimb';
const storage = new S3Client({ endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000', region: process.env.S3_REGION || 'us-east-1', forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', credentials: { accessKeyId: process.env.S3_ACCESS_KEY || 'nimbminio', secretAccessKey: process.env.S3_SECRET_KEY || 'nimbminio-local-only' } });
let bucketReady = false;
async function ensureBucket() { if (bucketReady)
    return; try {
    await storage.send(new HeadBucketCommand({ Bucket: bucket }));
}
catch (e) {
    if (process.env.S3_CREATE_BUCKET !== 'true')
        throw e;
    await storage.send(new CreateBucketCommand({ Bucket: bucket }));
} bucketReady = true; }
const publicUser = { id: true, username: true, name: true, bio: true, bioPrivate: true, onlineVisible: true, links: true, hasAvatar: true, hasBanner: true, mediaVersion: true, hasMusic: true, hasMusicCover: true, musicTitle: true, musicArtist: true, musicVersion: true, createdAt: true };
const digest = (s) => createHash('sha256').update(s).digest('hex');
async function session(token) {
    if (!token || !/^[a-f0-9]{64}$/.test(token))
        return null;
    const s = await db.session.findUnique({ where: { id: digest(token) }, include: { user: { select: publicUser } } });
    if (!s || s.expiresAt <= new Date())
        return null;
    const account = await db.user.findUnique({ where: { id: s.userId }, select: { email: true, emailVerified: true, suspended: true } });
    return account && !account.suspended && (!account.email || account.emailVerified) ? s : null;
}
async function auth(req, reply) {
    const s = await session(req.cookies.nimb_session);
    if (!s) {
        reply.code(401).send({ error: 'Войдите в аккаунт' });
        return null;
    }
    req.viewerId = s.userId;
    return s;
}
app.addHook('preSerialization', async (req, _reply, payload) => { const redact = (value) => { if (!value || typeof value !== 'object' || value instanceof Date)
    return; if (Array.isArray(value)) {
    for (const item of value)
        redact(item);
    return;
} if (typeof value.username === 'string' && typeof value.bioPrivate === 'boolean') {
    if (value.bioPrivate && value.id !== req.viewerId)
        value.bio = '';
    value.online = value.onlineVisible ? (onlineUsers.get(value.id) || 0) > 0 : null;
} for (const child of Object.values(value))
    redact(child); }; redact(payload); return payload; });
async function setSession(userId, reply) {
    const token = randomBytes(32).toString('hex');
    await db.session.create({ data: { id: digest(token), userId, expiresAt: new Date(Date.now() + 30 * 86400_000) } });
    reply.setCookie('nimb_session', token, { httpOnly: true, secure: production, sameSite: 'strict', path: '/', maxAge: 30 * 86400 });
}
const sendMail = createMailSender({ provider: process.env.MAIL_PROVIDER, brevoApiKey: process.env.BREVO_API_KEY, brevoSenderEmail: process.env.BREVO_SENDER_EMAIL, brevoSenderName: process.env.BREVO_SENDER_NAME, smtpHost: process.env.SMTP_HOST, smtpPort: process.env.SMTP_PORT, smtpSecure: process.env.SMTP_SECURE, smtpUser: process.env.SMTP_USER, smtpPassword: process.env.SMTP_PASSWORD, mailFrom: process.env.MAIL_FROM });
async function mailToken(userId, email, kind) { const token = randomBytes(32).toString('hex'); await db.$transaction([db.authToken.deleteMany({ where: { userId, kind } }), db.authToken.create({ data: { id: digest(token), userId, kind, expiresAt: new Date(Date.now() + (kind === 'verify' ? 24 * 3600_000 : 3600_000)) } })]); const link = `${origin}/?${kind}=${token}`; await sendMail({ to: email, subject: kind === 'verify' ? 'Подтвердите email в nimb' : 'Восстановление пароля nimb', text: `${kind === 'verify' ? 'Подтвердите ваш email' : 'Для смены пароля откройте ссылку'}:\n${link}\n\nЕсли вы не запрашивали это действие, проигнорируйте письмо.` }); }
const account = z.object({ username: z.string().regex(/^[a-zA-Z0-9_]{3,24}$/).transform(s => s.toLowerCase()), name: z.string().trim().min(1).max(50), password: z.string().min(10).max(128) });
app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError)
        return reply.code(400).send({ error: 'Проверьте введённые данные' });
    if (err.code === 'P2002')
        return reply.code(409).send({ error: 'Имя пользователя уже занято' });
    if (err.statusCode && err.statusCode < 500)
        return reply.code(err.statusCode).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: 'Ошибка сервера' });
});
app.get('/api/health', async (_req, reply) => { try {
    await db.$queryRaw `SELECT 1`;
    return { ok: true };
}
catch {
    return reply.code(503).send({ ok: false });
} });
app.post('/api/register', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const data = account.parse(req.body);
    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id });
    const user = await db.user.create({ data: { username: data.username, name: data.name, passwordHash }, select: publicUser });
    if (user.id <= 100)
        await db.badgeAward.upsert({ where: { userId_badge: { userId: user.id, badge: 'early' } }, create: { userId: user.id, badge: 'early' }, update: {} });
    await setSession(user.id, reply);
    return { user };
});
app.post('/api/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const data = z.object({ username: z.string().trim().min(1).max(254).optional(), email: z.string().email().max(254).optional(), password: z.string().max(128) }).refine(d => d.username || d.email).parse(req.body);
    const identifier = (data.username || data.email || '').toLowerCase().replace(/^@/, '');
    const u = identifier.includes('@') ? await db.user.findUnique({ where: { email: identifier } }) : await db.user.findUnique({ where: { username: identifier } });
    if (!u || !(await argon2.verify(u.passwordHash, data.password)))
        return reply.code(401).send({ error: 'Неверное имя пользователя или пароль' });
    if (u.suspended)
        return reply.code(403).send({ error: 'Аккаунт ограничен администратором' });
    if (u.email && !u.emailVerified)
        return reply.code(403).send({ error: 'Подтвердите email по ссылке из письма' });
    await setSession(u.id, reply);
    req.viewerId = u.id;
    const user = await db.user.findUnique({ where: { id: u.id }, select: publicUser });
    return { user };
});
app.post('/api/verify-email', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => { const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(req.body); const t = await db.authToken.findUnique({ where: { id: digest(token) } }); if (!t || t.kind !== 'verify' || t.expiresAt <= new Date())
    return reply.code(400).send({ error: 'Ссылка недействительна или устарела' }); const used = await db.$transaction(async (tx) => { const result = await tx.authToken.deleteMany({ where: { id: t.id, kind: 'verify', expiresAt: { gt: new Date() } } }); if (!result.count)
    return false; await tx.user.update({ where: { id: t.userId }, data: { emailVerified: true } }); if (t.userId <= 100)
    await tx.badgeAward.upsert({ where: { userId_badge: { userId: t.userId, badge: 'early' } }, create: { userId: t.userId, badge: 'early' }, update: {} }); return true; }); if (!used)
    return reply.code(400).send({ error: 'Ссылка уже использована' }); await setSession(t.userId, reply); return { ok: true }; });
app.post('/api/resend-verification', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => { const { email } = z.object({ email: z.string().email().max(254) }).parse(req.body); const u = await db.user.findUnique({ where: { email: email.toLowerCase() } }); if (u?.email && !u.emailVerified)
    try {
        await mailToken(u.id, u.email, 'verify');
    }
    catch (err) {
        app.log.error(err);
    } return { ok: true }; });
app.post('/api/forgot-password', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => { const { email } = z.object({ email: z.string().email().max(254) }).parse(req.body); const u = await db.user.findUnique({ where: { email: email.toLowerCase() } }); if (u?.email && u.emailVerified)
    try {
        await mailToken(u.id, u.email, 'reset');
    }
    catch (err) {
        app.log.error(err);
    } return { ok: true }; });
app.post('/api/reset-password', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => { const { token, password } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(10).max(128) }).parse(req.body); const t = await db.authToken.findUnique({ where: { id: digest(token) } }); if (!t || t.kind !== 'reset' || t.expiresAt <= new Date())
    return reply.code(400).send({ error: 'Ссылка недействительна или устарела' }); const passwordHash = await argon2.hash(password, { type: argon2.argon2id }); const used = await db.$transaction(async (tx) => { const result = await tx.authToken.deleteMany({ where: { id: t.id, kind: 'reset', expiresAt: { gt: new Date() } } }); if (!result.count)
    return false; await tx.user.update({ where: { id: t.userId }, data: { passwordHash } }); await tx.session.deleteMany({ where: { userId: t.userId } }); return true; }); if (!used)
    return reply.code(400).send({ error: 'Ссылка уже использована' }); io.in(`user:${t.userId}`).disconnectSockets(true); return { ok: true }; });
app.post('/api/logout', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; await db.session.deleteMany({ where: { id: s.id } }); for (const socket of (await io.in(`user:${s.userId}`).fetchSockets()))
    if (socket.data.sessionId === s.id)
        socket.disconnect(true); reply.clearCookie('nimb_session', { path: '/' }); return { ok: true }; });
const adminIds = new Set((process.env.ADMIN_USER_IDS || '').split(',').map(x => Number(x.trim())).filter(x => Number.isSafeInteger(x) && x > 0));
async function adminAuth(req, reply) { const s = await auth(req, reply); if (!s)
    return null; if (!adminIds.has(s.userId)) {
    reply.code(403).send({ error: 'Доступ запрещён' });
    return null;
} return s; }
app.get('/api/admin/overview', async (req, reply) => { if (!await adminAuth(req, reply))
    return; const [users, communities, openReports] = await Promise.all([db.user.count(), db.chat.count({ where: { kind: { in: ['group', 'channel'] } } }), db.report.count({ where: { resolvedAt: null } })]); return { users, communities, openReports }; });
app.get('/api/admin/users', async (req, reply) => { if (!await adminAuth(req, reply))
    return; const { q } = z.object({ q: z.string().trim().max(50).default('') }).parse(req.query); return { users: await db.user.findMany({ where: q ? { OR: [{ username: { contains: q.toLowerCase().replace(/^@/, '') } }, { name: { contains: q, mode: 'insensitive' } }, ...(/^\d{1,9}$/.test(q) ? [{ id: Number(q) }] : [])] } : {}, select: { id: true, username: true, name: true, createdAt: true, suspended: true, nimbBalance: true }, orderBy: { id: 'desc' }, take: 100 }) }; });
app.post('/api/admin/users/:id/currency', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => { const actor = await adminAuth(req, reply); if (!actor)
    return; const id = z.coerce.number().int().positive().parse(req.params.id); const { amount } = z.object({ amount: z.number().int().min(1).max(1000000) }).parse(req.body); const result = await db.$transaction(async (tx) => { const updated = await tx.user.updateMany({ where: { id, nimbBalance: { lte: 2147483647 - amount } }, data: { nimbBalance: { increment: amount } } }); if (!updated.count)
    return null; await tx.currencyGrant.create({ data: { adminId: actor.userId, recipientId: id, amount } }); return tx.user.findUniqueOrThrow({ where: { id }, select: { nimbBalance: true } }); }); if (!result)
    return reply.code(400).send({ error: 'Пользователь не найден или превышен максимальный баланс' }); return { balance: result.nimbBalance }; });
app.post('/api/admin/users/:id/gifts', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => { const actor = await adminAuth(req, reply); if (!actor)
    return; const id = z.coerce.number().int().positive().parse(req.params.id); const { template } = z.object({ template: z.enum(['star', 'heart', 'flower', 'comet', 'moon', 'diamond']) }).parse(req.body); if (!await db.user.findUnique({ where: { id }, select: { id: true } }))
    return reply.code(404).send({ error: 'Пользователь не найден' }); const gift = await db.gift.create({ data: { ownerId: id, template, events: { create: { senderId: actor.userId } } } }); io.to(`user:${id}`).emit('gift:new', { userId: id }); return { gift: { id: gift.id } }; });
app.get('/api/admin/reports', async (req, reply) => { if (!await adminAuth(req, reply))
    return; return { reports: await db.report.findMany({ where: { resolvedAt: null }, select: { id: true, reason: true, createdAt: true, reporter: { select: { id: true, username: true, name: true } }, reported: { select: { id: true, username: true, name: true, suspended: true } } }, orderBy: { id: 'desc' }, take: 100 }) }; });
app.post('/api/admin/reports/:id/resolve', async (req, reply) => { if (!await adminAuth(req, reply))
    return; const id = z.coerce.number().int().positive().parse(req.params.id); const result = await db.report.updateMany({ where: { id, resolvedAt: null }, data: { resolvedAt: new Date() } }); if (!result.count)
    return reply.code(404).send({ error: 'Жалоба не найдена' }); return { ok: true }; });
app.post('/api/admin/users/:id/suspension', async (req, reply) => { const actor = await adminAuth(req, reply); if (!actor)
    return; const id = z.coerce.number().int().positive().parse(req.params.id); const { suspended } = z.object({ suspended: z.boolean() }).parse(req.body); if (adminIds.has(id))
    return reply.code(400).send({ error: 'Нельзя ограничить администратора' }); const updated = await db.user.updateMany({ where: { id }, data: { suspended } }); if (!updated.count)
    return reply.code(404).send({ error: 'Пользователь не найден' }); if (suspended) {
    await db.session.deleteMany({ where: { userId: id } });
    for (const socket of await io.in(`user:${id}`).fetchSockets())
        socket.disconnect(true);
} return { ok: true }; });
app.get('/api/me', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; return { user: s.user, isAdmin: adminIds.has(s.userId) }; });
app.patch('/api/me', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const data = z.object({ name: z.string().trim().min(1).max(50), bio: z.string().trim().max(500) }).parse(req.body); const user = await db.user.update({ where: { id: s.userId }, data, select: publicUser }); await announceProfile(s.userId); return { user }; });
app.put('/api/me/links', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const { links } = z.object({ links: z.array(z.object({ label: z.string().trim().min(1).max(40), url: z.string().url().max(500).refine(isAllowedSocialLink) })).max(5) }).parse(req.body); const user = await db.user.update({ where: { id: s.userId }, data: { links }, select: publicUser }); await announceProfile(s.userId); return { user }; });
app.get('/api/me/privacy', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const privacy = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { bioPrivate: true, onlineVisible: true, messagesFrom: true } }); return { privacy }; });
app.patch('/api/me/privacy', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const data = z.object({ bioPrivate: z.boolean().optional(), onlineVisible: z.boolean().optional(), messagesFrom: z.enum(['everyone', 'followers', 'nobody']).optional() }).refine(value => value.bioPrivate !== undefined || value.onlineVisible !== undefined || value.messagesFrom !== undefined).parse(req.body); const user = await db.user.update({ where: { id: s.userId }, data, select: publicUser }); await announceProfile(s.userId); return { user }; });
app.put('/api/me/media/:kind', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const kind = z.enum(['avatar', 'banner']).parse(req.params.kind); const file = await req.file(); if (!file)
    return reply.code(400).send({ error: 'Выберите изображение' }); const bytes = await file.toBuffer(); const type = await fileTypeFromBuffer(bytes); if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime))
    return reply.code(400).send({ error: 'Допустимы только JPEG, PNG и WebP' }); let sanitized; try {
    sanitized = await sharp(bytes, { limitInputPixels: 20_000_000 }).rotate().resize({ width: kind === 'avatar' ? 512 : 1920, height: kind === 'avatar' ? 512 : 800, fit: 'cover', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
}
catch {
    return reply.code(400).send({ error: 'Не удалось обработать изображение' });
} const field = kind === 'avatar' ? 'avatarKey' : 'bannerKey'; const hasField = kind === 'avatar' ? 'hasAvatar' : 'hasBanner'; const previous = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { avatarKey: true, bannerKey: true } }); const key = randomBytes(24).toString('hex'); await ensureBucket(); await storage.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: sanitized, ContentType: 'image/webp' })); try {
    const user = await db.user.update({ where: { id: s.userId }, data: { [field]: key, [hasField]: true, mediaVersion: { increment: 1 } }, select: publicUser });
    if (previous[field])
        await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: previous[field] })).catch(err => app.log.error(err));
    await announceProfile(s.userId);
    return { user };
}
catch (err) {
    await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => { });
    throw err;
} });
app.delete('/api/me/media/:kind', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const kind = z.enum(['avatar', 'banner']).parse(req.params.kind); const field = kind === 'avatar' ? 'avatarKey' : 'bannerKey'; const hasField = kind === 'avatar' ? 'hasAvatar' : 'hasBanner'; const previous = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { avatarKey: true, bannerKey: true } }); const user = await db.user.update({ where: { id: s.userId }, data: { [field]: null, [hasField]: false, mediaVersion: { increment: 1 } }, select: publicUser }); if (previous[field])
    await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: previous[field] })).catch(err => app.log.error(err)); await announceProfile(s.userId); return { user }; });
app.get('/api/users/:id/media/:kind', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = z.coerce.number().int().positive().parse(req.params.id), kind = z.enum(['avatar', 'banner']).parse(req.params.kind); const user = await db.user.findUnique({ where: { id }, select: { avatarKey: true, bannerKey: true } }); const key = kind === 'avatar' ? user?.avatarKey : user?.bannerKey; if (!key)
    return reply.code(404).send({ error: 'Изображение не найдено' }); await ensureBucket(); const object = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: key })); return reply.header('Content-Type', 'image/webp').header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, no-cache').send(object.Body); });
app.put('/api/me/music', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const file = await req.file(); if (!file)
    return reply.code(400).send({ error: 'Выберите аудиофайл' }); const field = file.fields.metadata; let raw; try {
    raw = JSON.parse(String(field && 'value' in field ? field.value : ''));
}
catch {
    return reply.code(400).send({ error: 'Укажите данные трека' });
} const data = z.object({ title: z.string().trim().min(1).max(100), artist: z.string().trim().min(1).max(100), rights: z.literal(true) }).parse(raw); const bytes = await file.toBuffer(); const type = await fileTypeFromBuffer(bytes); if (!type || type.mime !== 'audio/mpeg')
    return reply.code(400).send({ error: 'Поддерживаются MP3 до 5 МиБ' }); const previous = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { musicKey: true } }); const key = randomBytes(24).toString('hex'); await ensureBucket(); await storage.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: 'audio/mpeg' })); try {
    const user = await db.user.update({ where: { id: s.userId }, data: { musicKey: key, musicMime: 'audio/mpeg', musicTitle: data.title, musicArtist: data.artist, hasMusic: true, musicVersion: { increment: 1 } }, select: publicUser });
    if (previous.musicKey)
        await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: previous.musicKey })).catch(err => app.log.error(err));
    await announceProfile(s.userId);
    return { user };
}
catch (err) {
    await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => { });
    throw err;
} });
app.delete('/api/me/music', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const previous = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { musicKey: true, musicCoverKey: true } }); const user = await db.user.update({ where: { id: s.userId }, data: { musicKey: null, musicCoverKey: null, hasMusicCover: false, musicMime: null, musicTitle: '', musicArtist: '', hasMusic: false, musicVersion: { increment: 1 } }, select: publicUser }); for (const key of [previous.musicKey, previous.musicCoverKey])
    if (key)
        await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(err => app.log.error(err)); await announceProfile(s.userId); return { user }; });
app.put('/api/me/music/cover', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const previous = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { hasMusic: true, musicCoverKey: true } }); if (!previous.hasMusic)
    return reply.code(400).send({ error: 'Сначала загрузите трек' }); const file = await req.file(); if (!file)
    return reply.code(400).send({ error: 'Выберите обложку' }); const bytes = await file.toBuffer(); const type = await fileTypeFromBuffer(bytes); if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime))
    return reply.code(400).send({ error: 'Допустимы только JPEG, PNG и WebP' }); let image; try {
    image = await sharp(bytes, { limitInputPixels: 20_000_000 }).rotate().resize({ width: 512, height: 512, fit: 'cover', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
}
catch {
    return reply.code(400).send({ error: 'Не удалось обработать изображение' });
} const key = randomBytes(24).toString('hex'); await ensureBucket(); await storage.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: image, ContentType: 'image/webp' })); try {
    const result = await db.user.updateMany({ where: { id: s.userId, hasMusic: true }, data: { musicCoverKey: key, hasMusicCover: true, musicVersion: { increment: 1 } } });
    if (!result.count) {
        await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        return reply.code(409).send({ error: 'Трек был удалён' });
    }
    const user = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: publicUser });
    if (previous.musicCoverKey)
        await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: previous.musicCoverKey })).catch(err => app.log.error(err));
    await announceProfile(s.userId);
    return { user };
}
catch (error) {
    await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => { });
    throw error;
} });
app.delete('/api/me/music/cover', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const previous = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { musicCoverKey: true } }); const user = await db.user.update({ where: { id: s.userId }, data: { musicCoverKey: null, hasMusicCover: false, musicVersion: { increment: 1 } }, select: publicUser }); if (previous.musicCoverKey)
    await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: previous.musicCoverKey })).catch(err => app.log.error(err)); await announceProfile(s.userId); return { user }; });
app.get('/api/users/:id/music/cover', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); if (await blocked(id, s.userId))
    return reply.code(404).send({ error: 'Обложка не найдена' }); const user = await db.user.findUnique({ where: { id }, select: { musicCoverKey: true } }); if (!user?.musicCoverKey)
    return reply.code(404).send({ error: 'Обложка не найдена' }); await ensureBucket(); const object = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: user.musicCoverKey })); return reply.header('Content-Type', 'image/webp').header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, no-cache').send(object.Body); });
app.get('/api/users/:id/music', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); if (await blocked(id, s.userId))
    return reply.code(404).send({ error: 'Трек не найден' }); const user = await db.user.findUnique({ where: { id }, select: { musicKey: true, musicMime: true } }); if (!user?.musicKey)
    return reply.code(404).send({ error: 'Трек не найден' }); const range = req.headers.range; if (range && !/^bytes=\d+-\d*$/.test(range))
    return reply.code(416).send({ error: 'Недопустимый диапазон' }); await ensureBucket(); const obj = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: user.musicKey, ...(range ? { Range: range } : {}) })); reply.header('Content-Type', user.musicMime || 'audio/mpeg').header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, no-store').header('Accept-Ranges', 'bytes'); if (obj.ContentRange)
    reply.code(206).header('Content-Range', obj.ContentRange); if (obj.ContentLength !== undefined)
    reply.header('Content-Length', obj.ContentLength); return reply.send(obj.Body); });
app.get('/api/users', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const { q } = z.object({ q: z.string().trim().min(1).max(50) }).parse(req.query); const term = q.startsWith('@') ? q.slice(1).trim() : q; if (!term)
    return { users: [] }; return { users: await db.user.findMany({ where: { id: { not: s.userId }, OR: [{ username: { contains: term.toLowerCase() } }, { name: { contains: term, mode: 'insensitive' } }] }, select: publicUser, take: 20 }) }; });
app.get('/api/users/:id', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = z.coerce.number().int().positive().parse(req.params.id); const user = await db.user.findUnique({ where: { id }, select: publicUser }); if (!user)
    return reply.code(404).send({ error: 'Пользователь не найден' }); return { user }; });
app.post('/api/chats', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const { userId } = z.object({ userId: z.number().int().positive() }).parse(req.body); if (userId === s.userId)
    return reply.code(400).send({ error: 'Нельзя создать чат с собой' }); if (!await db.user.findUnique({ where: { id: userId } }))
    return reply.code(404).send({ error: 'Пользователь не найден' }); if (!await canDirectMessage(s.userId, userId))
    return reply.code(403).send({ error: 'Общение с пользователем недоступно' }); const pairKey = [s.userId, userId].sort((a, b) => a - b).join(':'); const chat = await db.chat.upsert({ where: { pairKey }, update: {}, create: { pairKey, members: { create: [{ userId: s.userId }, { userId }] } }, include: { members: { include: { user: { select: publicUser } } }, media: { select: { hasAvatar: true, hasBanner: true, version: true } } } }); return { chat }; });
app.get('/api/chats', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const chats = await db.chat.findMany({ where: { members: { some: { userId: s.userId } } }, include: { members: { include: { user: { select: publicUser } } }, media: { select: { hasAvatar: true, hasBanner: true, version: true } }, messages: { orderBy: { id: 'desc' }, take: 1 } }, orderBy: { id: 'desc' } }); return { chats }; });
async function member(chatId, userId) { return db.member.findUnique({ where: { chatId_userId: { chatId, userId } } }); }
app.get('/api/chats/:id/messages', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = z.coerce.number().int().positive().parse(req.params.id); if (!await member(id, s.userId))
    return reply.code(404).send({ error: 'Чат не найден' }); const { q, before } = z.object({ q: z.string().trim().max(100).optional(), before: z.coerce.number().int().positive().optional() }).parse(req.query); const rows = await db.message.findMany({ where: { chatId: id, ...(before ? { id: { lt: before } } : {}), ...(q ? { text: { contains: q, mode: 'insensitive' } } : {}) }, include: { replyTo: { select: { id: true, text: true, senderId: true } }, reactions: true, attachment: { select: { id: true, name: true, mime: true, size: true } } }, orderBy: { id: 'desc' }, take: 51 }); const hasMore = rows.length > 50; const messages = rows.slice(0, 50); const chat = await db.chat.findUnique({ where: { id }, select: { kind: true } }); const blockedDirect = chat?.kind === 'direct' && await isDirectBlocked(id, s.userId); let deliveryCounts = new Map(); if (chat?.kind === 'direct' && !blockedDirect && messages.length) {
    const received = messages.filter(m => m.senderId !== s.userId);
    if (received.length) {
        const inserted = await db.messageDelivery.createMany({ data: received.map(m => ({ messageId: m.id, userId: s.userId })), skipDuplicates: true });
        if (inserted.count)
            for (const senderId of new Set(received.map(m => m.senderId)))
                io.to(`user:${senderId}`).emit('delivery:update', { chatId: id });
    }
    const totals = await db.messageDelivery.groupBy({ by: ['messageId'], where: { messageId: { in: messages.map(m => m.id) } }, _count: { _all: true } });
    deliveryCounts = new Map(totals.map(x => [x.messageId, x._count._all]));
} let counts = new Map(); if (chat?.kind === 'channel' && messages.length) {
    const viewed = messages.filter(m => m.senderId !== s.userId).map(m => ({ messageId: m.id, userId: s.userId }));
    const inserted = viewed.length ? await db.messageView.createMany({ data: viewed, skipDuplicates: true }) : { count: 0 };
    const totals = await db.messageView.groupBy({ by: ['messageId'], where: { messageId: { in: messages.map(m => m.id) } }, _count: { _all: true } });
    counts = new Map(totals.map(x => [x.messageId, x._count._all]));
    if (inserted.count) {
        const recipients = await db.member.findMany({ where: { chatId: id, userId: { not: s.userId } }, select: { userId: true } });
        for (const recipient of recipients)
            io.to(`user:${recipient.userId}`).emit('message:refresh', { chatId: id });
    }
} if (!blockedDirect && !q && !before && messages.length) {
    const changed = await db.member.updateMany({ where: { chatId: id, userId: s.userId, lastReadId: { lt: messages[0].id } }, data: { lastReadId: messages[0].id } });
    if (changed.count)
        await notifyChat(id, 'read', { chatId: id, userId: s.userId, lastReadId: messages[0].id });
} messages.reverse(); return { messages: messages.map(message => ({ ...message, viewCount: counts.get(message.id) || 0, delivered: (deliveryCounts.get(message.id) || 0) > 0 })), nextCursor: hasMore ? messages[0].id : null }; });
app.post('/api/chats/:id/messages', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = z.coerce.number().int().positive().parse(req.params.id); const { text, replyToId } = z.object({ text: z.string().trim().min(1).max(4000), replyToId: z.number().int().positive().optional() }).parse(req.body); if (!await member(id, s.userId))
    return reply.code(404).send({ error: 'Чат не найден' }); const chat = await db.chat.findUnique({ where: { id } }); const membership = await member(id, s.userId); if (chat?.kind === 'channel' && !['owner', 'admin'].includes(membership.role))
    return reply.code(403).send({ error: 'Только администраторы могут публиковать в канале' }); if (chat?.kind === 'direct') {
    const others = await db.member.findMany({ where: { chatId: id, userId: { not: s.userId } } });
    for (const other of others)
        if (!await canDirectMessage(s.userId, other.userId))
            return reply.code(403).send({ error: 'Общение с пользователем недоступно' });
} if (replyToId && !await db.message.findFirst({ where: { id: replyToId, chatId: id } }))
    return reply.code(400).send({ error: 'Сообщение для ответа не найдено' }); const message = await db.message.create({ data: { chatId: id, senderId: s.userId, text, replyToId }, include: { replyTo: { select: { id: true, text: true, senderId: true } }, reactions: true, attachment: { select: { id: true, name: true, mime: true, size: true } } } }); await notifyChat(id, 'message', message); return { message }; });
const intId = (v) => z.coerce.number().int().positive().parse(v);
async function blocked(a, b) { return !!await db.block.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] } }); }
async function canDirectMessage(from, to) { if (await blocked(from, to))
    return false; const target = await db.user.findUnique({ where: { id: to }, select: { messagesFrom: true } }); if (!target || target.messagesFrom === 'nobody')
    return false; if (target.messagesFrom === 'followers')
    return !!await db.follow.findUnique({ where: { followerId_followingId: { followerId: from, followingId: to } } }); return target.messagesFrom === 'everyone'; }
async function directInteractionAllowed(chatId, userId) { const chat = await db.chat.findUnique({ where: { id: chatId }, select: { kind: true } }); if (chat?.kind !== 'direct')
    return !!chat; const other = await db.member.findFirst({ where: { chatId, userId: { not: userId } }, select: { userId: true } }); return !!other && await canDirectMessage(userId, other.userId); }
async function isDirectBlocked(chatId, userId) { const chat = await db.chat.findUnique({ where: { id: chatId }, select: { kind: true } }); if (chat?.kind !== 'direct')
    return false; const other = await db.member.findFirst({ where: { chatId, userId: { not: userId } }, select: { userId: true } }); return !!other && await blocked(userId, other.userId); }
async function blockedIds(userId) { const rows = await db.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } }); return rows.map(x => x.blockerId === userId ? x.blockedId : x.blockerId); }
async function relatedUsers(userId) { const [members, followers] = await Promise.all([db.member.findMany({ where: { chat: { members: { some: { userId } } } }, select: { userId: true }, distinct: ['userId'] }), db.follow.findMany({ where: { followingId: userId }, select: { followerId: true } })]); return [...new Set([userId, ...members.map(m => m.userId), ...followers.map(f => f.followerId)])].map(id => `user:${id}`); }
async function announceProfile(userId) { io.to(await relatedUsers(userId)).emit('profile:update', { id: userId }); }
async function announcePresence(userId) { io.to(await relatedUsers(userId)).emit('presence:update', { id: userId }); }
async function pushChatMessage(chatId, senderId) { if (!pushReady)
    return; const subscriptions = await db.pushSubscription.findMany({ where: { session: { expiresAt: { gt: new Date() }, userId: { not: senderId }, user: { memberships: { some: { chatId } } } } }, take: 1000 }); await Promise.allSettled(subscriptions.map(async (sub) => { try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title: 'nimb', body: 'Новое сообщение', url: '/' }), { TTL: 60 });
}
catch (error) {
    const status = error.statusCode;
    if (status === 404 || status === 410)
        await db.pushSubscription.deleteMany({ where: { id: sub.id } });
    else
        app.log.warn({ status }, 'Push-доставка не удалась');
} })); }
async function notifyChat(chatId, event, payload) { const members = await db.member.findMany({ where: { chatId } }); const message = event === 'message' && payload && typeof payload === 'object' && 'senderId' in payload && 'id' in payload ? payload : null; const chat = message ? await db.chat.findUnique({ where: { id: chatId }, select: { kind: true } }) : null; for (const m of members) {
    if (message && chat?.kind === 'direct' && m.userId !== message.senderId) {
        io.to(`user:${m.userId}`).timeout(5000).emit(event, payload, (_err, responses) => { if (responses?.some(response => response?.received))
            void db.messageDelivery.upsert({ where: { messageId_userId: { messageId: message.id, userId: m.userId } }, create: { messageId: message.id, userId: m.userId }, update: {} }).then(() => { io.to(`user:${message.senderId}`).emit('delivery:update', { chatId }); }).catch(error => app.log.debug(error)); });
    }
    else
        io.to(`user:${m.userId}`).emit(event, payload);
} if (message)
    void pushChatMessage(chatId, message.senderId).catch(error => app.log.error(error)); }
app.get('/api/blocks', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; return { blocks: await db.block.findMany({ where: { blockerId: s.userId }, include: { blocked: { select: publicUser } } }) }; });
app.post('/api/users/:id/block', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); if (id === s.userId)
    return reply.code(400).send({ error: 'Нельзя заблокировать себя' }); if (!await db.user.findUnique({ where: { id } }))
    return reply.code(404).send({ error: 'Пользователь не найден' }); await db.$transaction([db.block.upsert({ where: { blockerId_blockedId: { blockerId: s.userId, blockedId: id } }, create: { blockerId: s.userId, blockedId: id }, update: {} }), db.follow.deleteMany({ where: { OR: [{ followerId: s.userId, followingId: id }, { followerId: id, followingId: s.userId }] } })]); return { ok: true }; });
app.delete('/api/users/:id/block', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); await db.block.deleteMany({ where: { blockerId: s.userId, blockedId: id } }); return { ok: true }; });
app.post('/api/users/:id/report', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); const { reason } = z.object({ reason: z.string().trim().min(5).max(1000) }).parse(req.body); if (id === s.userId)
    return reply.code(400).send({ error: 'Нельзя пожаловаться на себя' }); if (!await db.user.findUnique({ where: { id } }))
    return reply.code(404).send({ error: 'Пользователь не найден' }); await db.report.create({ data: { reporterId: s.userId, reportedId: id, reason } }); return { ok: true }; });
app.get('/api/follows', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; return { ids: (await db.follow.findMany({ where: { followerId: s.userId }, select: { followingId: true } })).map(x => x.followingId) }; });
app.post('/api/users/:id/follow', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); if (id === s.userId)
    return reply.code(400).send({ error: 'Нельзя подписаться на себя' }); if (!await db.user.findUnique({ where: { id } }) || await blocked(s.userId, id))
    return reply.code(404).send({ error: 'Пользователь не найден' }); await db.follow.upsert({ where: { followerId_followingId: { followerId: s.userId, followingId: id } }, create: { followerId: s.userId, followingId: id }, update: {} }); return { ok: true }; });
app.delete('/api/users/:id/follow', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); await db.follow.deleteMany({ where: { followerId: s.userId, followingId: id } }); return { ok: true }; });
app.get('/api/posts', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const q = z.object({ cursor: z.coerce.number().int().positive().optional(), tab: z.enum(['all', 'following']).default('all'), authorId: z.coerce.number().int().positive().optional(), q: z.string().max(100).optional() }).parse(req.query); const exclude = await blockedIds(s.userId); const following = q.tab === 'following' ? (await db.follow.findMany({ where: { followerId: s.userId }, select: { followingId: true } })).map(f => f.followingId) : undefined; const rows = await db.post.findMany({ where: { authorId: { notIn: exclude, ...(following ? { in: following } : {}), ...(q.authorId ? { equals: q.authorId } : {}) }, ...(q.cursor ? { id: { lt: q.cursor } } : {}), ...(q.q ? { text: { contains: q.q, mode: 'insensitive' } } : {}) }, orderBy: { id: 'desc' }, take: 21, include: { author: { select: publicUser }, image: { select: { id: true } }, _count: { select: { likes: true, comments: true } }, likes: { where: { userId: s.userId }, select: { userId: true } } } }); const more = rows.length > 20; const posts = rows.slice(0, 20).map(({ likes, ...post }) => ({ ...post, liked: likes.length > 0 })); return { posts, nextCursor: more ? posts[posts.length - 1].id : null }; });
app.post('/api/posts/image', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const file = await req.file(); if (!file)
    return reply.code(400).send({ error: 'Выберите изображение' }); const field = file.fields.text; const text = z.string().trim().max(4000).parse(field && 'value' in field ? field.value : ''); const bytes = await file.toBuffer(); const type = await fileTypeFromBuffer(bytes); if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime))
    return reply.code(400).send({ error: 'Допустимы только JPEG, PNG и WebP' }); let sanitized; try {
    sanitized = await sharp(bytes, { limitInputPixels: 20_000_000 }).rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
}
catch {
    return reply.code(400).send({ error: 'Не удалось обработать изображение' });
} const key = randomBytes(24).toString('hex'); await ensureBucket(); await storage.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: sanitized, ContentType: 'image/webp' })); try {
    const post = await db.post.create({ data: { authorId: s.userId, text, image: { create: { objectKey: key } } }, include: { author: { select: publicUser }, image: { select: { id: true } } } });
    return { post };
}
catch (err) {
    await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => { });
    throw err;
} });
app.get('/api/post-images/:id', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); const image = await db.postImage.findUnique({ where: { id } }); if (!image || !await visiblePost(image.postId, s.userId))
    return reply.code(404).send({ error: 'Изображение не найдено' }); await ensureBucket(); const object = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: image.objectKey })); return reply.header('Content-Type', 'image/webp').header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, no-store').send(object.Body); });
app.post('/api/posts', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(req.body); return { post: await db.post.create({ data: { authorId: s.userId, text }, include: { author: { select: publicUser } } }) }; });
app.delete('/api/posts/:id', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); const post = await db.post.findFirst({ where: { id, authorId: s.userId }, include: { image: true } }); if (!post)
    return reply.code(404).send({ error: 'Публикация не найдена' }); await db.post.delete({ where: { id } }); if (post.image)
    await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: post.image.objectKey })).catch(err => app.log.error(err)); return { ok: true }; });
async function visiblePost(id, userId) { const post = await db.post.findUnique({ where: { id }, select: { id: true, authorId: true } }); return post && !await blocked(userId, post.authorId) ? post : null; }
app.post('/api/posts/:id/like', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); if (!await visiblePost(id, s.userId))
    return reply.code(404).send({ error: 'Публикация не найдена' }); await db.postLike.upsert({ where: { postId_userId: { postId: id, userId: s.userId } }, create: { postId: id, userId: s.userId }, update: {} }); return { ok: true }; });
app.delete('/api/posts/:id/like', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); await db.postLike.deleteMany({ where: { postId: id, userId: s.userId } }); return { ok: true }; });
app.get('/api/posts/:id/comments', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); if (!await visiblePost(id, s.userId))
    return reply.code(404).send({ error: 'Публикация не найдена' }); const exclude = await blockedIds(s.userId); return { comments: await db.comment.findMany({ where: { postId: id, authorId: { notIn: exclude } }, include: { author: { select: publicUser } }, orderBy: { id: 'asc' }, take: 100 }) }; });
app.post('/api/posts/:id/comments', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); if (!await visiblePost(id, s.userId))
    return reply.code(404).send({ error: 'Публикация не найдена' }); const { text } = z.object({ text: z.string().trim().min(1).max(2000) }).parse(req.body); return { comment: await db.comment.create({ data: { postId: id, authorId: s.userId, text }, include: { author: { select: publicUser } } }) }; });
app.patch('/api/messages/:id', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(req.body); const m = await db.message.findUnique({ where: { id } }); if (!m || m.senderId !== s.userId || !await member(m.chatId, s.userId))
    return reply.code(404).send({ error: 'Сообщение не найдено' }); if (!await directInteractionAllowed(m.chatId, s.userId))
    return reply.code(403).send({ error: 'Общение с пользователем недоступно' }); const message = await db.message.update({ where: { id }, data: { text, editedAt: new Date() }, include: { replyTo: { select: { id: true, text: true, senderId: true } }, reactions: true, attachment: { select: { id: true, name: true, mime: true, size: true } } } }); await notifyChat(m.chatId, 'message:update', message); return { message }; });
app.delete('/api/messages/:id', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); const m = await db.message.findUnique({ where: { id }, include: { attachment: true } }); if (!m || m.senderId !== s.userId || !await member(m.chatId, s.userId))
    return reply.code(404).send({ error: 'Сообщение не найдено' }); await db.message.delete({ where: { id } }); if (m.attachment)
    try {
        await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: m.attachment.objectKey }));
    }
    catch (err) {
        app.log.error(err);
    } await notifyChat(m.chatId, 'message:delete', { id, chatId: m.chatId }); return { ok: true }; });
app.get('/api/catalog/gifts', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; return { templates: Object.entries(gifts).map(([id, value]) => ({ id, ...value })) }; });
app.get('/api/users/:id/badges', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const userId = intId(req.params.id); if (!await db.user.findUnique({ where: { id: userId } }) || await blocked(s.userId, userId))
    return reply.code(404).send({ error: 'Пользователь не найден' }); const awards = await db.badgeAward.findMany({ where: { userId }, orderBy: { awardedAt: 'asc' } }); return { badges: awards.filter(a => badges[a.badge]).map(a => ({ ...badges[a.badge], id: a.badge, awardedAt: a.awardedAt })) }; });
app.get('/api/users/:id/gifts', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const userId = intId(req.params.id); if (!await db.user.findUnique({ where: { id: userId } }) || await blocked(s.userId, userId))
    return reply.code(404).send({ error: 'Пользователь не найден' }); const owned = await db.gift.findMany({ where: { ownerId: userId }, orderBy: [{ pinned: 'desc' }, { id: 'desc' }], take: 100, include: { events: { take: 1, orderBy: { id: 'asc' }, include: { sender: { select: publicUser } } } } }); return { gifts: owned.filter(g => g.template in gifts).map(g => ({ id: g.id, template: g.template, ...gifts[g.template], pinned: g.pinned, receivedAt: g.receivedAt, ownerId: g.ownerId, sender: g.events[0]?.sender || null })) }; });
app.post('/api/users/:id/gifts', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const userId = intId(req.params.id); const { template } = z.object({ template: z.enum(['star', 'heart', 'flower', 'comet', 'moon', 'diamond']) }).parse(req.body); if (userId === s.userId)
    return reply.code(400).send({ error: 'Подарок можно отправить другому пользователю' }); if (!await db.user.findUnique({ where: { id: userId } }) || await blocked(s.userId, userId))
    return reply.code(404).send({ error: 'Пользователь не найден' }); const gift = await db.gift.create({ data: { ownerId: userId, template, events: { create: { senderId: s.userId } } } }); io.to(`user:${userId}`).emit('gift:new', { userId }); return { gift }; });
app.patch('/api/gifts/:id/pin', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); const { pinned } = z.object({ pinned: z.boolean() }).parse(req.body); const result = await db.$transaction(async (tx) => { await tx.$executeRaw `SELECT pg_advisory_xact_lock(${s.userId})`; const gift = await tx.gift.findFirst({ where: { id, ownerId: s.userId } }); if (!gift)
    return 'missing'; if (pinned && !gift.pinned && (await tx.gift.count({ where: { ownerId: s.userId, pinned: true } })) >= 3)
    return 'limit'; await tx.gift.update({ where: { id }, data: { pinned } }); return 'ok'; }); if (result === 'missing')
    return reply.code(404).send({ error: 'Подарок не найден' }); if (result === 'limit')
    return reply.code(400).send({ error: 'Можно закрепить не более трёх подарков' }); await announceProfile(s.userId); return { ok: true }; });
app.post('/api/messages/:id/forward', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); const { chatId } = z.object({ chatId: z.number().int().positive() }).parse(req.body); const source = await db.message.findUnique({ where: { id }, include: { attachment: true } }); if (!source || !await member(source.chatId, s.userId))
    return reply.code(404).send({ error: 'Сообщение не найдено' }); const destination = await db.chat.findUnique({ where: { id: chatId } }); const membership = await member(chatId, s.userId); if (!destination || !membership)
    return reply.code(404).send({ error: 'Чат не найден' }); if (destination.kind === 'channel' && !['owner', 'admin'].includes(membership.role))
    return reply.code(403).send({ error: 'Только администраторы могут публиковать в канале' }); if (destination.kind === 'direct') {
    const other = await db.member.findFirst({ where: { chatId, userId: { not: s.userId } } });
    if (other && !await canDirectMessage(s.userId, other.userId))
        return reply.code(403).send({ error: 'Общение с пользователем недоступно' });
} let copiedKey; if (source.attachment) {
    copiedKey = randomBytes(24).toString('hex');
    await ensureBucket();
    await storage.send(new CopyObjectCommand({ Bucket: bucket, Key: copiedKey, CopySource: `${encodeURIComponent(bucket)}/${encodeURIComponent(source.attachment.objectKey)}` }));
} try {
    const message = await db.message.create({ data: { chatId, senderId: s.userId, text: source.text, forwarded: true, ...(source.attachment && copiedKey ? { attachment: { create: { objectKey: copiedKey, name: source.attachment.name, mime: source.attachment.mime, size: source.attachment.size } } } : {}) }, include: { replyTo: { select: { id: true, text: true, senderId: true } }, reactions: true, attachment: { select: { id: true, name: true, mime: true, size: true } } } });
    await notifyChat(chatId, 'message', message);
    return { message };
}
catch (err) {
    if (copiedKey)
        await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: copiedKey })).catch(() => { });
    throw err;
} });
app.post('/api/messages/:id/reaction', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); const { emoji } = z.object({ emoji: z.enum(['❤️', '👍', '😂', '😮', '😢', '🔥']) }).parse(req.body); const m = await db.message.findUnique({ where: { id } }); if (!m || !await member(m.chatId, s.userId))
    return reply.code(404).send({ error: 'Сообщение не найдено' }); if (!await directInteractionAllowed(m.chatId, s.userId))
    return reply.code(403).send({ error: 'Общение с пользователем недоступно' }); const key = { messageId_userId_emoji: { messageId: id, userId: s.userId, emoji } }; const existing = await db.reaction.findUnique({ where: key }); if (existing)
    await db.reaction.delete({ where: key });
else
    await db.reaction.create({ data: { messageId: id, userId: s.userId, emoji } }); await notifyChat(m.chatId, 'message:refresh', { chatId: m.chatId }); return { ok: true }; });
app.post('/api/messages/:id/pin', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); const m = await db.message.findUnique({ where: { id }, include: { chat: true } }); const membership = m ? await member(m.chatId, s.userId) : null; if (!m || !membership || (m.chat.kind !== 'direct' && !['owner', 'admin'].includes(membership.role)))
    return reply.code(404).send({ error: 'Сообщение не найдено' }); if (!await directInteractionAllowed(m.chatId, s.userId))
    return reply.code(403).send({ error: 'Общение с пользователем недоступно' }); await db.message.update({ where: { id }, data: { pinned: !m.pinned } }); await notifyChat(m.chatId, 'message:refresh', { chatId: m.chatId }); return { ok: true }; });
app.post('/api/chats/:id/files', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); const membership = await member(id, s.userId); const chat = await db.chat.findUnique({ where: { id } }); if (!membership || !chat)
    return reply.code(404).send({ error: 'Чат не найден' }); if (chat.kind === 'channel' && !['owner', 'admin'].includes(membership.role))
    return reply.code(403).send({ error: 'Только администраторы могут публиковать в канале' }); if (chat.kind === 'direct') {
    const other = await db.member.findFirst({ where: { chatId: id, userId: { not: s.userId } } });
    if (other && !await canDirectMessage(s.userId, other.userId))
        return reply.code(403).send({ error: 'Общение с пользователем недоступно' });
} const file = await req.file(); if (!file)
    return reply.code(400).send({ error: 'Выберите файл' }); const bytes = await file.toBuffer(); if (!bytes.length)
    return reply.code(400).send({ error: 'Пустой файл' }); const type = await fileTypeFromBuffer(bytes); if (!type || !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(type.mime))
    return reply.code(400).send({ error: 'Допустимы только JPEG, PNG, WebP и PDF' }); let name = (file.filename.split(/[\\/]/).pop() || 'file').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 120) || 'file'; let content = bytes; let mime = type.mime; if (mime.startsWith('image/')) {
    try {
        content = await sharp(bytes, { limitInputPixels: 20_000_000 }).rotate().resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
        mime = 'image/webp';
        name = name.replace(/\.(jpe?g|png|webp)$/i, '') + '.webp';
    }
    catch {
        return reply.code(400).send({ error: 'Не удалось обработать изображение' });
    }
    if (content.length > 5 * 1024 * 1024)
        return reply.code(400).send({ error: 'Изображение слишком большое' });
} const key = randomBytes(24).toString('hex'); await ensureBucket(); await storage.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: content, ContentType: mime })); try {
    const message = await db.message.create({ data: { chatId: id, senderId: s.userId, text: name, attachment: { create: { objectKey: key, name, mime, size: content.length } } }, include: { replyTo: { select: { id: true, text: true, senderId: true } }, reactions: true, attachment: { select: { id: true, name: true, mime: true, size: true } } } });
    await notifyChat(id, 'message', message);
    return { message };
}
catch (e) {
    await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => { });
    throw e;
} });
app.get('/api/files/:id', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); const file = await db.attachment.findUnique({ where: { id }, include: { message: { select: { chatId: true } } } }); if (!file || !await member(file.message.chatId, s.userId))
    return reply.code(404).send({ error: 'Файл не найден' }); await ensureBucket(); const object = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: file.objectKey })); reply.header('Content-Type', file.mime).header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, no-store').header('Content-Disposition', `${file.mime.startsWith('image/') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`); return reply.send(object.Body); });
app.post('/api/communities', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const data = z.object({ title: z.string().trim().min(1).max(80), description: z.string().trim().max(500).default(''), kind: z.enum(['group', 'channel']) }).parse(req.body); const chat = await db.$transaction(async (tx) => { const created = await tx.chat.create({ data: { ...data, members: { create: { userId: s.userId, role: 'owner' } } }, include: { members: { include: { user: { select: publicUser } } }, media: { select: { hasAvatar: true, hasBanner: true, version: true } } } }); if (data.kind === 'channel')
    await tx.badgeAward.upsert({ where: { userId_badge: { userId: s.userId, badge: 'channel_author' } }, create: { userId: s.userId, badge: 'channel_author' }, update: {} }); return created; }); return { chat }; });
app.put('/api/communities/:id/media/:kind', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id), kind = z.enum(['avatar', 'banner']).parse(req.params.kind); const membership = await member(id, s.userId); const chat = await db.chat.findUnique({ where: { id }, select: { kind: true } }); if (!chat || chat.kind === 'direct' || !membership || !['owner', 'admin'].includes(membership.role))
    return reply.code(404).send({ error: 'Сообщество не найдено' }); const file = await req.file(); if (!file)
    return reply.code(400).send({ error: 'Выберите изображение' }); const bytes = await file.toBuffer(); const type = await fileTypeFromBuffer(bytes); if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime))
    return reply.code(400).send({ error: 'Допустимы только JPEG, PNG и WebP' }); let sanitized; try {
    sanitized = await sharp(bytes, { limitInputPixels: 20_000_000 }).rotate().resize({ width: kind === 'avatar' ? 512 : 1920, height: kind === 'avatar' ? 512 : 800, fit: 'cover', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
}
catch {
    return reply.code(400).send({ error: 'Не удалось обработать изображение' });
} const field = kind === 'avatar' ? 'avatarKey' : 'bannerKey', hasField = kind === 'avatar' ? 'hasAvatar' : 'hasBanner'; const previous = await db.communityMedia.findUnique({ where: { chatId: id } }); const key = randomBytes(24).toString('hex'); await ensureBucket(); await storage.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: sanitized, ContentType: 'image/webp' })); try {
    await db.communityMedia.upsert({ where: { chatId: id }, create: { chatId: id, [field]: key, [hasField]: true, version: 1 }, update: { [field]: key, [hasField]: true, version: { increment: 1 } } });
    if (previous?.[field])
        await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: previous[field] })).catch(err => app.log.error(err));
    await notifyChat(id, 'community:update', { chatId: id });
    return { ok: true };
}
catch (error) {
    await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => { });
    throw error;
} });
app.delete('/api/communities/:id/media/:kind', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id), kind = z.enum(['avatar', 'banner']).parse(req.params.kind); const membership = await member(id, s.userId); const chat = await db.chat.findUnique({ where: { id }, select: { kind: true } }); if (!chat || chat.kind === 'direct' || !membership || !['owner', 'admin'].includes(membership.role))
    return reply.code(404).send({ error: 'Сообщество не найдено' }); const field = kind === 'avatar' ? 'avatarKey' : 'bannerKey', hasField = kind === 'avatar' ? 'hasAvatar' : 'hasBanner'; const previous = await db.communityMedia.findUnique({ where: { chatId: id } }); if (previous) {
    await db.communityMedia.update({ where: { chatId: id }, data: { [field]: null, [hasField]: false, version: { increment: 1 } } });
    if (previous[field])
        await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: previous[field] })).catch(err => app.log.error(err));
} await notifyChat(id, 'community:update', { chatId: id }); return { ok: true }; });
app.get('/api/communities/:id/media/:kind', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id), kind = z.enum(['avatar', 'banner']).parse(req.params.kind); if (!await member(id, s.userId))
    return reply.code(404).send({ error: 'Изображение не найдено' }); const media = await db.communityMedia.findUnique({ where: { chatId: id } }); const key = kind === 'avatar' ? media?.avatarKey : media?.bannerKey; if (!key)
    return reply.code(404).send({ error: 'Изображение не найдено' }); await ensureBucket(); const object = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: key })); return reply.header('Content-Type', 'image/webp').header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, no-cache').send(object.Body); });
app.post('/api/communities/:id/invite', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); const m = await member(id, s.userId); const chat = await db.chat.findUnique({ where: { id } }); if (!chat || chat.kind === 'direct' || !m || !['owner', 'admin'].includes(m.role))
    return reply.code(404).send({ error: 'Сообщество не найдено' }); const token = randomBytes(32).toString('hex'); await db.chat.update({ where: { id }, data: { inviteHash: digest(token) } }); return { invite: `${origin}/?invite=${token}` }; });
app.post('/api/communities/join', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(req.body); const chat = await db.chat.findUnique({ where: { inviteHash: digest(token) } }); if (!chat || chat.kind === 'direct')
    return reply.code(404).send({ error: 'Приглашение недействительно' }); await db.member.upsert({ where: { chatId_userId: { chatId: chat.id, userId: s.userId } }, create: { chatId: chat.id, userId: s.userId }, update: {} }); return { chat: await db.chat.findUnique({ where: { id: chat.id }, include: { members: { include: { user: { select: publicUser } } }, media: { select: { hasAvatar: true, hasBanner: true, version: true } } } }) }; });
app.patch('/api/communities/:id', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); const m = await member(id, s.userId); const chat = await db.chat.findUnique({ where: { id } }); if (!chat || chat.kind === 'direct' || !m || !['owner', 'admin'].includes(m.role))
    return reply.code(404).send({ error: 'Сообщество не найдено' }); const data = z.object({ title: z.string().trim().min(1).max(80), description: z.string().trim().max(500) }).parse(req.body); return { chat: await db.chat.update({ where: { id }, data, include: { members: { include: { user: { select: publicUser } } }, media: { select: { hasAvatar: true, hasBanner: true, version: true } } } }) }; });
app.patch('/api/communities/:id/members/:userId', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id), userId = intId(req.params.userId); const actor = await member(id, s.userId), target = await member(id, userId); const { role } = z.object({ role: z.enum(['admin', 'member']) }).parse(req.body); if (!actor || actor.role !== 'owner' || !target || target.role === 'owner')
    return reply.code(404).send({ error: 'Участник не найден' }); await db.member.update({ where: { chatId_userId: { chatId: id, userId } }, data: { role } }); return { ok: true }; });
app.delete('/api/communities/:id/members/:userId', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id), userId = intId(req.params.userId); const actor = await member(id, s.userId), target = await member(id, userId); if (!actor || !target || target.role === 'owner' || !(userId === s.userId || actor.role === 'owner' || (actor.role === 'admin' && target.role === 'member')))
    return reply.code(404).send({ error: 'Участник не найден' }); await db.member.delete({ where: { chatId_userId: { chatId: id, userId } } }); return { ok: true }; });
app.get('/api/push/public-key', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; if (!pushReady)
    return reply.code(503).send({ error: 'Push-уведомления не настроены на сервере' }); return { publicKey: process.env.VAPID_PUBLIC_KEY }; });
app.post('/api/push/subscriptions', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const sub = z.object({ endpoint: z.string().url().max(2048), keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{20,32}$/) }) }).parse(req.body); if (!isAllowedPushEndpoint(sub.endpoint))
    return reply.code(400).send({ error: 'Недопустимый адрес службы уведомлений' }); if (!pushReady)
    return reply.code(503).send({ error: 'Push-уведомления не настроены на сервере' }); const existing = await db.pushSubscription.findUnique({ where: { endpoint: sub.endpoint }, select: { id: true, session: { select: { userId: true } } } }); if (existing) {
    if (existing.session.userId !== s.userId)
        return reply.code(409).send({ error: 'Подписка уже используется' });
    const updated = await db.pushSubscription.updateMany({ where: { id: existing.id, session: { userId: s.userId } }, data: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, sessionId: s.id } });
    if (!updated.count)
        return reply.code(409).send({ error: 'Подписка изменилась' });
}
else {
    try {
        await db.pushSubscription.create({ data: { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, sessionId: s.id } });
    }
    catch (error) {
        if (error.code === 'P2002')
            return reply.code(409).send({ error: 'Подписка уже используется' });
        throw error;
    }
} return { ok: true }; });
app.delete('/api/push/subscriptions', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; await db.pushSubscription.deleteMany({ where: { sessionId: s.id } }); return { ok: true }; });
app.get('/api/me/account', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const user = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { email: true, username: true, createdAt: true, emailVerified: true, nimbBalance: true } }); return { account: user }; });
app.get('/api/me/storage', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const totals = await db.attachment.aggregate({ where: { message: { senderId: s.userId } }, _sum: { size: true }, _count: { id: true } }); return { chatAttachments: { count: totals._count.id, bytes: totals._sum.size || 0 } }; });
app.get('/api/folders', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const folders = await db.chatFolder.findMany({ where: { userId: s.userId }, include: { chats: { where: { chat: { members: { some: { userId: s.userId } } } }, select: { chatId: true } } }, orderBy: { id: 'asc' } }); return { folders: folders.map(({ chats, ...folder }) => ({ ...folder, chatIds: chats.map(c => c.chatId) })) }; });
app.post('/api/folders', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const { name } = z.object({ name: z.string().trim().min(1).max(30) }).parse(req.body); const folder = await db.$transaction(async (tx) => { await tx.$executeRaw `SELECT pg_advisory_xact_lock(${s.userId}::int, 10)`; if (await tx.chatFolder.count({ where: { userId: s.userId } }) >= 10)
    return null; return tx.chatFolder.create({ data: { userId: s.userId, name } }); }); if (!folder)
    return reply.code(400).send({ error: 'Можно создать не более 10 папок' }); return { folder }; });
app.patch('/api/folders/:id', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); const { name } = z.object({ name: z.string().trim().min(1).max(30) }).parse(req.body); const result = await db.chatFolder.updateMany({ where: { id, userId: s.userId }, data: { name } }); if (!result.count)
    return reply.code(404).send({ error: 'Папка не найдена' }); return { ok: true }; });
app.delete('/api/folders/:id', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id); const result = await db.chatFolder.deleteMany({ where: { id, userId: s.userId } }); if (!result.count)
    return reply.code(404).send({ error: 'Папка не найдена' }); return { ok: true }; });
app.put('/api/folders/:id/chats/:chatId', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = intId(req.params.id), chatId = intId(req.params.chatId); const { present } = z.object({ present: z.boolean() }).parse(req.body); if (!await db.chatFolder.findFirst({ where: { id, userId: s.userId } }))
    return reply.code(404).send({ error: 'Папка не найдена' }); if (present) {
    if (!await member(chatId, s.userId))
        return reply.code(404).send({ error: 'Чат не найден' });
    await db.folderChat.upsert({ where: { folderId_chatId: { folderId: id, chatId } }, create: { folderId: id, chatId }, update: {} });
}
else
    await db.folderChat.deleteMany({ where: { folderId: id, chatId } }); return { ok: true }; });
app.get('/api/sessions', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const sessions = await db.session.findMany({ where: { userId: s.userId, expiresAt: { gt: new Date() } }, select: { id: true, createdAt: true, expiresAt: true }, orderBy: { createdAt: 'desc' } }); return { sessions: sessions.map(x => ({ ...x, current: x.id === s.id })) }; });
app.delete('/api/sessions/:id', async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const id = z.string().regex(/^[a-f0-9]{64}$/).parse(req.params.id); if (id === s.id)
    return reply.code(400).send({ error: 'Для текущего сеанса используйте выход из аккаунта' }); await db.session.deleteMany({ where: { id, userId: s.userId } }); for (const socket of await io.in(`user:${s.userId}`).fetchSockets())
    if (socket.data.sessionId === id)
        socket.disconnect(true); return { ok: true }; });
app.post('/api/password', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => { const s = await auth(req, reply); if (!s)
    return; const { currentPassword, newPassword } = z.object({ currentPassword: z.string().max(128), newPassword: z.string().min(10).max(128) }).parse(req.body); const user = await db.user.findUniqueOrThrow({ where: { id: s.userId } }); if (!await argon2.verify(user.passwordHash, currentPassword))
    return reply.code(400).send({ error: 'Неверный текущий пароль' }); const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id }); await db.$transaction([db.user.update({ where: { id: s.userId }, data: { passwordHash } }), db.session.deleteMany({ where: { userId: s.userId, id: { not: s.id } } })]); for (const socket of await io.in(`user:${s.userId}`).fetchSockets())
    if (socket.data.sessionId !== s.id)
        socket.disconnect(true); return { ok: true }; });
// Optional single-origin hosting for a built web app (e.g. Render).
if (process.env.STATIC_ROOT) {
    await app.register(fastifyStatic, { root: resolve(process.env.STATIC_ROOT), wildcard: false });
}
const io = new Server(app.server, { cors: { origin, credentials: true }, allowRequest: (req, cb) => cb(null, req.headers.origin === origin) });
io.use(async (socket, next) => { try {
    const raw = socket.handshake.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('nimb_session='))?.slice('nimb_session='.length);
    const s = await session(raw);
    if (!s)
        return next(new Error('Unauthorized'));
    socket.data.userId = s.userId;
    socket.data.sessionId = s.id;
    socket.data.expiresAt = s.expiresAt.getTime();
    next();
}
catch {
    next(new Error('Unauthorized'));
} });
io.on('connection', socket => { const userId = socket.data.userId; socket.join(`user:${userId}`); onlineUsers.set(userId, (onlineUsers.get(userId) || 0) + 1); if (onlineUsers.get(userId) === 1)
    void announcePresence(userId).catch(error => app.log.error(error)); const timer = setTimeout(() => socket.disconnect(true), Math.min(2147483647, Math.max(0, socket.data.expiresAt - Date.now()))); socket.on('disconnect', () => { clearTimeout(timer); const left = (onlineUsers.get(userId) || 1) - 1; if (left <= 0) {
    onlineUsers.delete(userId);
    void announcePresence(userId).catch(error => app.log.error(error));
}
else
    onlineUsers.set(userId, left); }); socket.on('typing', async (input) => { try {
    const parsed = z.object({ chatId: z.number().int().positive() }).safeParse(input);
    if (!parsed.success || Date.now() - (socket.data.lastTyping || 0) < 1000)
        return;
    socket.data.lastTyping = Date.now();
    const active = await db.session.findUnique({ where: { id: socket.data.sessionId } });
    if (!active || active.expiresAt <= new Date())
        return socket.disconnect(true);
    const chatId = parsed.data.chatId;
    const membership = await member(chatId, socket.data.userId);
    if (!membership)
        return;
    const chat = await db.chat.findUnique({ where: { id: chatId } });
    if (!chat || (chat.kind === 'channel' && !['owner', 'admin'].includes(membership.role)))
        return;
    const members = await db.member.findMany({ where: { chatId, userId: { not: socket.data.userId } } });
    for (const m of members) {
        if (chat.kind === 'direct' && !await canDirectMessage(socket.data.userId, m.userId))
            continue;
        io.to(`user:${m.userId}`).emit('typing', { chatId, userId: socket.data.userId });
    }
}
catch (err) {
    app.log.error(err);
} }); });
await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
