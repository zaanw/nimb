import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { readFile, mkdir } from "node:fs/promises";
import { navigate } from "./navigation";

// Only an explicitly selected local database may be used by this real-browser scenario.
test.skip(
  !process.env.TEST_BROWSER_DATABASE_URL,
  "Requires an isolated local browser database and API",
);
const db = new PrismaClient({
  datasourceUrl: process.env.TEST_BROWSER_DATABASE_URL,
});
const storage = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
  },
});
async function register(page: Page, username: string, name: string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="username"]').fill(username);
  await page
    .getByLabel("Пароль", { exact: true })
    .fill("browser-safe-password");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Чаты", exact: true }),
  ).toBeVisible();
}
test("real accounts register, log in, exchange messages and attachments, edit a profile and publish from a phone", async ({
  browser,
}) => {
  expect(["localhost", "127.0.0.1"]).toContain(
    new URL(process.env.TEST_BROWSER_DATABASE_URL!).hostname,
  );
  const suffix = Date.now().toString(36);
  const names = ["e2ea" + suffix, "e2eb" + suffix];
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const mobile = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const a = await desktop.newPage(),
      b = await mobile.newPage();
    // Keep one browser behind a proxy that cannot establish WebSocket connections.
    await b.routeWebSocket("**/socket.io/**", (socket) => socket.close());
    const mobilePolling = b.waitForResponse(
      (response) =>
        response.url().includes("/socket.io/") &&
        response.url().includes("transport=polling") &&
        response.status() === 200,
    );
    await register(a, names[0], "Альфа");
    await register(b, names[1], "Бета");
    await mobilePolling;
    const secondUser = await db.user.findUniqueOrThrow({
      where: { username: names[1] },
    });
    const guest = await browser.newContext();
    try {
      const visitor = await guest.newPage();
      await visitor.goto("/?user=" + secondUser.id);
      await visitor.locator('input[name="username"]').fill(names[0]);
      await visitor
        .getByLabel("Пароль", { exact: true })
        .fill("browser-safe-password");
      await visitor.getByRole("button", { name: "Войти", exact: true }).click();
      await expect(
        visitor.getByRole("heading", { name: "Бета", exact: true }),
      ).toBeVisible();
    } finally {
      await guest.close();
    }
    await a
      .getByRole("button", { name: "Найти пользователя", exact: true })
      .click();
    await a.getByLabel("Поиск людей и чатов", { exact: true }).fill(names[1]);
    await a.getByRole("button", { name: /Бета/ }).click();
    await a.getByRole("button", { name: "Написать", exact: true }).click();
    await a
      .getByLabel("Сообщение", { exact: true })
      .fill("Привет с компьютера");
    await a.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(b.getByRole("button", { name: /Альфа/ })).toBeVisible();
    await b.getByRole("button", { name: /Альфа/ }).click();
    await expect(
      b.getByText("Привет с компьютера", { exact: true }),
    ).toBeVisible();
    await b.getByLabel("Сообщение", { exact: true }).fill("Ответ с телефона");
    await b.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(
      a.getByText("Ответ с телефона", { exact: true }),
    ).toBeVisible();
    await b
      .getByLabel("Сообщение", { exact: true })
      .fill("Черновик после перезагрузки");
    await b.reload();
    await expect(b.getByLabel("Сообщение", { exact: true })).toHaveValue(
      "Черновик после перезагрузки",
    );
    await b.getByLabel("Сообщение", { exact: true }).fill("");
    await mobile.setOffline(true);
    await expect(
      b.getByRole("status").filter({ hasText: "Нет подключения к интернету" }),
    ).toBeVisible();
    await b
      .getByLabel("Сообщение", { exact: true })
      .fill("Отложенный черновик");
    await expect(
      b.getByRole("button", { name: "Отправить", exact: true }),
    ).toBeDisabled();
    await a
      .getByLabel("Сообщение", { exact: true })
      .fill("Сообщение после восстановления связи");
    await a.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(
      a
        .locator(".message-area")
        .getByText("Сообщение после восстановления связи", { exact: true }),
    ).toBeVisible();
    await mobile.setOffline(false);
    await expect(
      b
        .locator(".message-area")
        .getByText("Сообщение после восстановления связи", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(b.getByLabel("Сообщение", { exact: true })).toHaveValue(
      "Отложенный черновик",
    );
    await b.getByLabel("Сообщение", { exact: true }).fill("");
    const image = await readFile(
      "apps/web/public/gifts/telegram/plush-pepe.webp",
    );
    await a.locator('.composer input[type="file"]').setInputFiles({
      name: "pepe.webp",
      mimeType: "image/webp",
      buffer: image,
    });
    await expect(b.getByAltText("pepe.webp", { exact: true })).toBeVisible();
    const chatDetails = a.getByRole("complementary", {
      name: "Сведения о чате",
    });
    const toggleDetails = a.getByRole("button", { name: "Детали чата" });
    await expect(chatDetails).toHaveCount(0);
    await toggleDetails.click();
    const attachedFile = chatDetails.getByRole("link", { name: /pepe\.webp/ });
    await expect(attachedFile).toHaveAttribute("href", /^\/api\/files\/\d+$/);
    await toggleDetails.click();
    await expect(chatDetails).toBeHidden();
    await toggleDetails.click();
    await expect(attachedFile).toBeVisible();
    const out =
      (process.env.NIMB_DESIGN_EVIDENCE || "/workspace/nimb-studio-evidence") +
      "/scenarios";
    await mkdir(out, { recursive: true });
    await a.screenshot({ path: out + "/real-chat-details.png" });
    await toggleDetails.click();
    await a.screenshot({ path: out + "/real-chat-desktop.png" });
    await b.screenshot({ path: out + "/real-chat-phone.png" });
    await a
      .getByRole("button", { name: "Действия с сообщением", exact: true })
      .first()
      .click();
    await a
      .getByRole("button", { name: "Переслать", exact: true })
      .first()
      .click();
    await a
      .getByRole("dialog", { name: "Выберите чат", exact: true })
      .locator(".people-list .list-item")
      .first()
      .click();
    await expect(
      a.getByText("Пересланное сообщение", { exact: true }).first(),
    ).toBeVisible();
    await b.getByRole("button", { name: "Назад", exact: true }).click();
    await navigate(b, "Профиль");
    await b.getByRole("button", { name: "Редактировать", exact: true }).click();
    const editor = b.getByRole("dialog", {
      name: "Редактировать",
      exact: true,
    });
    await editor.getByLabel("Загрузить аватар", { exact: true }).setInputFiles({
      name: "avatar.webp",
      mimeType: "image/webp",
      buffer: image,
    });
    await expect(editor.getByRole("status")).toContainText("Аватар обновлён");
    await editor
      .getByLabel("О себе", { exact: true })
      .fill("Проверка настоящего профиля");
    await editor
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    await expect(editor).toBeHidden();
    await expect(
      b.getByText("Проверка настоящего профиля", { exact: true }),
    ).toBeVisible();
    const input = a.getByRole("textbox", { name: "Сообщение", exact: true });
    await input.fill("Проверка эмодзи");
    await input.press("End");
    await a.getByRole("button", { name: "Эмодзи", exact: true }).click();
    await a.getByRole("button", { name: "Улыбка", exact: true }).click();
    await expect(input).toHaveValue("Проверка эмодзи😊");
    await input.press("Shift+Enter");
    await input.pressSequentially("Nimb");
    await expect(input).toHaveValue("Проверка эмодзи😊\nNimb");
    await input.press("Enter");
    await expect(
      a.locator(".message-area").getByText(/Проверка эмодзи😊/),
    ).toBeVisible();
    await a
      .getByRole("button", { name: "Создать группу или канал", exact: true })
      .click();
    const create = a.getByRole("dialog", { name: "Создать пространство" });
    await create
      .getByRole("combobox", { name: "Тип", exact: true })
      .selectOption("channel");
    await create.getByLabel("Название", { exact: true }).fill("Заметки Nimb");
    await create
      .getByLabel("Описание", { exact: true })
      .fill("Новости тестового канала");
    await create
      .getByRole("button", { name: "Создать", exact: true })
      .last()
      .click();
    await expect(a.locator(".channel-thread")).toBeVisible();
    await expect(toggleDetails).toHaveAttribute("aria-expanded", "false");
    await input.fill("Первая публикация канала");
    await input.press("Enter");
    await expect(
      a
        .locator(".message-area")
        .getByText("Первая публикация канала", { exact: true }),
    ).toBeVisible();
    await a.screenshot({ path: out + "/real-channel.png" });
    await a.locator(".chat-header .person-button").click();
    const channel = a.getByRole("dialog", { name: "О канале" });
    await expect(channel.locator(".community-description")).toHaveText(
      "Новости тестового канала",
    );
    await channel
      .getByRole("button", { name: "Создать ссылку приглашения" })
      .click();
    const invite = channel.getByLabel("Ссылка приглашения");
    await expect(invite).toHaveValue(/\?invite=/);
    const inviteURL = await invite.inputValue();
    await a.keyboard.press("Escape");
    await expect(channel).toBeHidden();
    await navigate(b, "Лента");
    await b
      .getByLabel("Текст публикации", { exact: true })
      .fill("Проверка фото");
    await b.locator('.post-image-picker input[type="file"]').setInputFiles({
      name: "photo.webp",
      mimeType: "image/webp",
      buffer: image,
    });
    await b.getByRole("button", { name: "Опубликовать", exact: true }).click();
    await expect(b.getByAltText("Изображение публикации")).toBeVisible();
    await b
      .getByRole("button", { name: "Удалить публикацию", exact: true })
      .click();
    await b
      .getByRole("dialog")
      .getByRole("button", { name: "Удалить", exact: true })
      .click();
    await expect(b.getByText("Проверка фото", { exact: true })).toHaveCount(0);
    await navigate(b, "Настройки");
    await b.getByRole("button", { name: "Шрифты", exact: true }).click();
    await b.getByLabel("Размер текста", { exact: true }).selectOption("large");
    await b.getByRole("button", { name: "Все настройки", exact: true }).click();
    await b
      .getByRole("button", { name: "Производительность", exact: true })
      .click();
    await b.getByRole("checkbox", { name: /Уменьшить движение/ }).check();
    await b.reload();
    expect(
      await b.evaluate(() => document.documentElement.dataset.reduceMotion),
    ).toBe("true");
    expect(
      await b.evaluate(() =>
        document.documentElement.style.getPropertyValue("--font-scale"),
      ),
    ).toBe("1.12");
    await navigate(b, "Настройки");
    await b
      .getByRole("button", { name: "Папки с чатами", exact: true })
      .click();
    await b.getByLabel("Название папки", { exact: true }).fill("Близкие");
    await b.getByRole("button", { name: "Создать", exact: true }).click();
    await b.getByRole("button", { name: /Близкие · 0/ }).click();
    await b.getByRole("checkbox", { name: "Альфа", exact: true }).check();
    await expect(
      b.getByRole("checkbox", { name: "Альфа", exact: true }),
    ).toBeChecked();
    await navigate(b, "Чаты");
    await b
      .locator(".chat-list-tabs")
      .getByRole("button", { name: "Близкие", exact: true })
      .click();
    await expect(b.getByRole("button", { name: /Альфа/ })).toBeVisible();
    expect(
      await b.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await b.goto(inviteURL);
    await b
      .getByRole("dialog", { name: "Вступить по ссылке" })
      .getByRole("button", { name: "Вступить", exact: true })
      .last()
      .click();
    await expect(b.locator(".channel-thread .message-text")).toContainText(
      "Первая публикация канала",
    );
    await expect(b.getByRole("textbox", { name: "Сообщение" })).toHaveCount(0);
    await b.screenshot({ path: out + "/real-channel-phone.png" });
  } finally {
    await desktop.close();
    await mobile.close();
    const users = await db.user.findMany({
      where: { username: { in: names } },
      select: {
        id: true,
        avatarKey: true,
        bannerKey: true,
        musicKey: true,
        musicCoverKey: true,
      },
    });
    const ids = users.map((user) => user.id);
    const attachments = await db.attachment.findMany({
      where: { message: { senderId: { in: ids } } },
    });
    const images = await db.postImage.findMany({
      where: { post: { authorId: { in: ids } } },
    });
    const keys = [
      ...users.flatMap((user) => [
        user.avatarKey,
        user.bannerKey,
        user.musicKey,
        user.musicCoverKey,
      ]),
      ...attachments.map((item) => item.objectKey),
      ...images.map((item) => item.objectKey),
    ].filter((key): key is string => !!key);
    for (const key of keys)
      await storage.send(
        new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
      );
    await db.chat.deleteMany({
      where: { members: { some: { userId: { in: ids } } } },
    });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
