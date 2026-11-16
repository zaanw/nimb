import { test, expect } from "@playwright/test";

test("mobile media editor shows upload errors, permits retry and validates size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let uploads = 0;
  const user = {
    id: 2,
    username: "media_test",
    name: "Медиа",
    bio: "",
    createdAt: "2026-11-16T10:00:00Z",
    hasAvatar: false,
    mediaVersion: 0,
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: any = { ok: true };
    let status = 200;
    if (path === "/api/me") data = { user, isAdmin: false };
    else if (path === "/api/chats") data = { chats: [] };
    else if (path === "/api/folders") data = { folders: [] };
    else if (path.endsWith("/badges")) data = { badges: [] };
    else if (path.endsWith("/gifts")) data = { gifts: [] };
    else if (path.endsWith("/posts")) data = { posts: [], nextCursor: null };
    else if (path === "/api/me/media/avatar") {
      uploads++;
      if (uploads === 1) {
        status = 503;
        data = { error: "Сервер временно недоступен. Попробуйте ещё раз." };
      } else {
        user.hasAvatar = true;
        user.mediaVersion++;
        data = { user };
      }
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("/");
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Профиль", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Редактировать", exact: true })
    .click();
  const input = page.getByLabel("Загрузить аватар", { exact: true });
  const file = {
    name: "test.png",
    mimeType: "image/png",
    buffer: Buffer.from("fixture image handled by mocked endpoint"),
  };
  await input.setInputFiles(file);
  await expect(page.getByRole("alert")).toContainText("Попробуйте ещё раз");
  await input.setInputFiles(file);
  await expect(page.getByRole("status")).toHaveText("Аватар обновлён");
  await expect(
    page.getByLabel("Удалить аватар", { exact: true }),
  ).toBeVisible();
  await input.setInputFiles({
    ...file,
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText("5 МиБ");
  expect(uploads).toBe(2);
  await page.screenshot({ path: "/tmp/nimb-media-editor-fix.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
