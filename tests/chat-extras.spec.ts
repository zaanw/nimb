import { test, expect } from "@playwright/test";
test("mobile can pin, archive, restore and save a message privately", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          (window as any).copiedMessage = text;
        },
      },
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const me = {
    id: 1,
    name: "zaan",
    username: "zaan",
    bio: "",
    createdAt: "2026-11-16T10:00:00Z",
  };
  const other = { ...me, id: 2, name: "Марк", username: "mark" };
  const preferences = { chatPinned: false, archived: false };
  let saved = false;
  const message = {
    id: 1,
    chatId: 1,
    senderId: 2,
    text: "Адрес встречи: парк у реки",
    createdAt: me.createdAt,
  };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname.replace("/api", "");
    let data: any = { ok: true };
    const method = route.request().method();
    if (path === "/me") data = { user: me, isAdmin: true };
    else if (path === "/chats")
      data = {
        chats: [
          {
            id: 1,
            kind: "direct",
            title: "",
            members: [
              {
                user: me,
                userId: 1,
                role: "member",
                lastReadId: 0,
                ...preferences,
              },
              { user: other, userId: 2, role: "member", lastReadId: 0 },
            ],
            messages: [message],
          },
        ],
      };
    else if (path === "/folders") data = { folders: [] };
    else if (path === "/chats/1/preferences")
      Object.assign(preferences, route.request().postDataJSON());
    else if (path === "/chats/1/messages")
      data = { messages: [{ ...message, saved }], nextCursor: null };
    else if (path === "/messages/1/saved")
      saved = route.request().postDataJSON().saved;
    else if (path === "/saved")
      data = {
        items: saved
          ? [
              {
                id: 1,
                savedAt: me.createdAt,
                message: {
                  ...message,
                  sender: other,
                  chat: { kind: "direct", title: "" },
                },
              },
            ]
          : [],
        nextCursor: null,
      };
    else if (path.endsWith("/badges")) data = { badges: [] };
    else if (path.endsWith("/gifts")) data = { gifts: [] };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("/");
  await page.locator(".chat-list-item").click();
  await page
    .getByRole("button", { name: "Действия с чатом", exact: true })
    .click();
  await page.getByRole("button", { name: /^Закрепить чат/ }).click();
  await expect.poll(() => preferences.chatPinned).toBe(true);
  await page
    .getByRole("button", { name: "Действия с сообщением", exact: true })
    .click();
  await page.getByRole("button", { name: "В избранное", exact: true }).click();
  await page
    .getByRole("button", { name: "Действия с сообщением", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Убрать из избранного", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Копировать текст", exact: true })
    .click();
  expect(await page.evaluate(() => (window as any).copiedMessage)).toBe(
    message.text,
  );
  await page
    .getByRole("button", { name: "Действия с чатом", exact: true })
    .click();
  await page.getByRole("button", { name: /^Убрать в архив/ }).click();
  await expect(
    page
      .locator(".chat-filters")
      .getByRole("button", { name: "Архив", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(preferences.archived).toBe(true);
  await page
    .locator(".chat-filters")
    .getByRole("button", { name: "Все", exact: true })
    .click();
  await expect(page.locator(".chat-list-item")).toHaveCount(0);
  await page
    .locator(".chat-filters")
    .getByRole("button", { name: "Архив", exact: true })
    .click();
  await page.locator(".chat-list-item").click();
  await page
    .getByRole("button", { name: "Действия с чатом", exact: true })
    .click();
  await page.getByRole("button", { name: /^Вернуть из архива/ }).click();
  await expect(
    page
      .locator(".chat-filters")
      .getByRole("button", { name: "Все", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(preferences.archived).toBe(false);
  await page.locator(".saved-chat").click();
  await expect(page.locator(".saved-card")).toContainText(message.text);
  await page.screenshot({ path: "/tmp/nimb-quiet-saved.png" });
  await page
    .getByRole("button", { name: "Убрать из избранного", exact: true })
    .click();
  await expect(page.locator(".saved-card")).toHaveCount(0);
  expect(saved).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
