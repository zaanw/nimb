// Run only in the private hosting terminal. No HTTP endpoint exposes this tool.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomBytes, createHash } from "node:crypto";

const db = new PrismaClient();
try {
  const origin = new URL(process.env.APP_ORIGIN || "http://localhost:5173");
  if (
    origin.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(origin.hostname)
  )
    throw new Error("APP_ORIGIN должен использовать HTTPS");
  const user = await db.user.findUnique({
    where: { id: 1 },
    select: { id: true, username: true },
  });
  if (!user) throw new Error("Аккаунт владельца ID 1 не найден");
  const token = randomBytes(32).toString("hex");
  await db.$transaction([
    db.authToken.deleteMany({ where: { userId: 1, kind: "reset" } }),
    db.authToken.create({
      data: {
        id: createHash("sha256").update(token).digest("hex"),
        userId: 1,
        kind: "reset",
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    }),
  ]);
  const link = new URL("/", origin);
  link.searchParams.set("reset", token);
  console.log(
    `Владелец: @${user.username} · ID 1\nЛичная ссылка для установки нового пароля (15 минут, один раз):\n${link.href}\nОткройте её самостоятельно. Не публикуйте ссылку или снимок терминала.\nПосле смены пароля прежние сеансы завершатся.`,
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Не удалось подготовить восстановление",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
