import { test, expect } from "@playwright/test";
test("profile displays multiple usernames and formatted numbers, with copying", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          (window as any).copiedAddress = text;
        },
      },
    }),
  );
  const user = {
    id: 1,
    username: "kent",
    name: "Kent",
    bio: "",
    createdAt: "2026-11-16T10:00:00Z",
  };
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: any = { ok: true };
    if (p === "/api/me") data = { user, isAdmin: true };
    else if (p === "/api/chats") data = { chats: [] };
    else if (p === "/api/folders") data = { folders: [] };
    else if (p.endsWith("/identifiers"))
      data = {
        names: [
          "kent",
          "ladesev",
          "suvorovec",
          "metallurg",
          "antibiotic",
          "newstar",
        ],
        numbers: ["+88804040888", "+666"],
      };
    else if (p.endsWith("/badges")) data = { badges: [] };
    else if (p.endsWith("/gifts")) data = { gifts: [] };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("/");
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Профиль", exact: true })
    .click();
  await expect(page.locator(".profile-also")).toContainText("@ladesev");
  await expect(page.locator(".profile-also")).toContainText("@newstar");
  await expect(
    page.getByRole("button", { name: "+888 0404 0888", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "@ladesev", exact: true }).click();
  expect(await page.evaluate(() => (window as any).copiedAddress)).toBe(
    "@ladesev",
  );
  await page
    .getByRole("button", {
      name: "Скопировать номер +88804040888",
      exact: true,
    })
    .click();
  expect(await page.evaluate(() => (window as any).copiedAddress)).toBe(
    "+88804040888",
  );
  await expect(page.getByRole("status")).toContainText("Скопировано");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "/tmp/nimb-profile-addresses-phone.png" });
});

test("wallet visibility controls publish only the selected collectible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let visible = false;
  let rejectNextVisibilityChange = false;
  const user = {
    id: 2,
    username: "kent",
    name: "Kent",
    bio: "",
    createdAt: "2026-11-16T10:00:00Z",
  };
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: any = { ok: true };
    if (p === "/api/me") data = { user, isAdmin: false };
    else if (p === "/api/chats") data = { chats: [] };
    else if (p === "/api/folders") data = { folders: [] };
    else if (p === "/api/wallet")
      data = {
        balance: 0,
        username: "kent",
        owned: [
          {
            username: "ladesev",
            price: 0,
            purchasedAt: user.createdAt,
            public: visible,
          },
        ],
      };
    else if (p === "/api/wallet/visibility") {
      const body = route.request().postDataJSON();
      expect(body.username).toBe("ladesev");
      if (rejectNextVisibilityChange) {
        await route.fulfill({
          status: 409,
          json: { error: "Изменение не сохранено" },
        });
        return;
      }
      visible = body.visible;
    } else if (p.endsWith("/identifiers"))
      data = { names: visible ? ["kent", "ladesev"] : ["kent"], numbers: [] };
    else if (p.endsWith("/badges")) data = { badges: [] };
    else if (p.endsWith("/gifts")) data = { gifts: [] };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("/");
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Кошелёк", exact: true })
    .click();
  const toggle = page.getByRole("checkbox", {
    name: "Показывать в профиле",
    exact: true,
  });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
  expect(visible).toBe(true);
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Профиль", exact: true })
    .click();
  await expect(page.locator(".profile-also")).toContainText("@ladesev");
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Кошелёк", exact: true })
    .click();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Профиль", exact: true })
    .click();
  await expect(page.locator(".profile-also")).toHaveCount(0);
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Кошелёк", exact: true })
    .click();
  rejectNextVisibilityChange = true;
  await toggle.click();
  await expect(page.getByRole("alert")).toContainText("Изменение не сохранено");
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeEnabled();
  expect(visible).toBe(false);
});
