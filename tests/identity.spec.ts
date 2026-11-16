import { test, expect, type Page } from "@playwright/test";

async function fixture(page: Page, owner = true, plus = true) {
  const me = {
    id: owner ? 1 : 2,
    name: "zaan",
    username: "zaan",
    createdAt: "2026-11-15T10:00:00Z",
    bio: "Место для своих.",
    plus,
    verified: true,
    nameEffect: "aurora",
    nameFont: "inter",
    profileAccent: "violet",
    collectibleNumber: "+666",
  };
  let badges: string[] = [];
  const changes: any[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api", "");
    const method = route.request().method();
    let data: any = { ok: true };
    if (path === "/me") data = { user: me, isAdmin: owner };
    else if (path === "/me/appearance") {
      const body = route.request().postDataJSON();
      changes.push(body);
      Object.assign(me, body);
    } else if (path === "/chats") data = { chats: [] };
    else if (path === "/folders") data = { folders: [] };
    else if (path === "/admin/overview")
      data = {
        users: 2,
        communities: 0,
        openReports: 0,
        newUsers: 2,
        totalBalance: 1000,
        gifts: 0,
      };
    else if (path === "/admin/users")
      data = {
        users: [{ ...me, suspended: false, nimbBalance: 1000, isAdmin: true }],
        total: 1,
        page: 1,
        pageSize: 20,
      };
    else if (path === "/admin/reports") data = { reports: [] };
    else if (path === "/admin/activity") data = { events: [] };
    else if (path === "/catalog/gifts") data = { templates: [] };
    else if (path.endsWith("/identity")) {
      if (method === "POST") {
        const body = route.request().postDataJSON();
        changes.push(body);
        if (body.kind === "plus") me.plus = body.enabled;
        else if (body.kind === "verified") me.verified = body.enabled;
        else
          badges = body.enabled
            ? [...badges, body.kind]
            : badges.filter((b) => b !== body.kind);
      } else
        data = {
          user: { ...me, badges: badges.map((badge) => ({ badge })) },
          history: [],
        };
    } else if (path.startsWith("/admin/users/"))
      data = {
        user: {
          ...me,
          suspended: false,
          nimbBalance: 1000,
          isAdmin: true,
          purchasedUsernames: [],
          _count: { gifts: 0, purchasedUsernames: 0 },
        },
      };
    else if (path.endsWith("/badges")) data = { badges: [] };
    else if (path.endsWith("/gifts")) data = { gifts: [] };
    else if (path.startsWith("/users/")) data = { user: me };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Сообщения", exact: true }),
  ).toBeVisible();
  return changes;
}
test("owner can award a badge, and Escape only cancels the top confirmation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const changes = await fixture(page);
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Профиль", exact: true })
    .click();
  await page.locator(".profile-admin-link").click();
  await page.getByRole("button", { name: /^Значки и Plus/ }).click();
  const manager = page.getByRole("dialog", {
    name: "Значки и привилегии",
    exact: true,
  });
  await expect(manager).toBeVisible();
  const row = manager
    .locator(".identity-option")
    .filter({ hasText: "Bug Hunter" });
  await row.getByRole("button", { name: "Выдать", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Выдать Bug Hunter?", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(manager).toBeVisible();
  expect(changes).toHaveLength(0);
  await row.getByRole("button", { name: "Выдать", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Выдать Bug Hunter?", exact: true })
    .getByRole("button", { name: "Выдать", exact: true })
    .click();
  await expect(
    row.getByRole("button", { name: "Отозвать", exact: true }),
  ).toBeVisible();
  expect(changes).toEqual([{ kind: "bug_hunter", enabled: true }]);
  await page.screenshot({ path: "/tmp/nimb-identity-manager-phone.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("Plus appearance saves, survives reload, and white verification appears beside the name", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const changes = await fixture(page, false, true);
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Профиль", exact: true })
    .click();
  await expect(page.locator(".profile-title .verified-badge")).toBeVisible();
  await expect(page.locator(".profile-number")).toContainText("+666");
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Настройки", exact: true })
    .click();
  await page.getByRole("button", { name: "nimb Plus", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "Радуга · владелец" }),
  ).toHaveCount(0);
  await page.getByLabel("Шрифт имени").selectOption("serif");
  await page.getByLabel("Эффект имени").selectOption("gold");
  await page.getByRole("button", { name: "Мята", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить оформление" }).click();
  await expect(page.getByRole("status")).toHaveText("Оформление сохранено.");
  expect(changes).toEqual([
    { nameFont: "serif", nameEffect: "gold", profileAccent: "mint" },
  ]);
  await page.reload();
  await expect(page.getByLabel("Шрифт имени")).toHaveValue("serif");
  await expect(
    page.getByRole("button", { name: "Мята", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "/tmp/nimb-plus-phone.png" });
});
test("ordinary accounts see the shared design but cannot edit Plus appearance", async ({
  page,
}) => {
  await fixture(page, false, false);
  await page
    .locator(".side-utilities")
    .getByRole("button", { name: "Настройки", exact: true })
    .click();
  await page.getByRole("button", { name: "nimb Plus", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Чуть больше вас" }),
  ).toBeVisible();
  await expect(page.getByLabel("Шрифт имени")).toHaveCount(0);
  expect(
    await page
      .locator(".shell")
      .evaluate((el) => getComputedStyle(el).backgroundImage),
  ).toContain("nimb-atmosphere.svg");
});
