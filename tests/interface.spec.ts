import { test, expect, type Page } from "@playwright/test";
import { gifts } from "../apps/api/src/catalog";

// Isolated UI fixtures: these checks never call a real account or wallet.
async function fixture(page: Page, isAdmin = true, secondChat = false) {
  const user = {
    id: 1,
    name: "Владелец",
    username: "owner",
    bio: "",
    links: [{ label: "Сайт сообщества", url: "https://example.com/nimb" }],
    createdAt: "2026-11-15T10:00:00Z",
  };
  const friend = { ...user, id: 2, name: "Собеседник", username: "friend" };
  const chat = {
    id: 1,
    kind: "direct",
    members: [
      { user, role: "member", lastReadId: 0 },
      { user: friend, role: "member", lastReadId: 0 },
    ],
    messages: [],
  };
  let purchases = 0;
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace("/api", "");
    let data: unknown = { ok: true };
    if (path === "/me") data = { user, isAdmin };
    else if (path === "/chats")
      data = {
        chats: secondChat
          ? [
              chat,
              {
                ...chat,
                id: 2,
                members: [
                  { user, role: "member", lastReadId: 0 },
                  {
                    user: {
                      ...friend,
                      id: 3,
                      name: "Другой собеседник",
                      username: "another",
                    },
                    role: "member",
                    lastReadId: 0,
                  },
                ],
              },
            ]
          : [chat],
      };
    else if (path === "/folders") data = { folders: [] };
    else if (/^\/chats\/\d+\/messages$/.test(path))
      data = { messages: [], nextCursor: null };
    else if (path === "/posts") data = { posts: [], nextCursor: null };
    else if (path.endsWith("/badges")) data = { badges: [] };
    else if (path.endsWith("/gifts")) data = { gifts: [] };
    else if (path === "/wallet")
      data = {
        balance: 2000 - purchases * 1000,
        username: purchases ? "777" : "owner",
        owned: purchases
          ? [{ username: "777", price: 1000, purchasedAt: user.createdAt }]
          : [],
      };
    else if (path === "/wallet/check")
      data = {
        username: url.searchParams.get("username"),
        price: 1000,
        available: true,
        owned: false,
      };
    else if (path === "/wallet/buy") purchases++;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Сообщения", exact: true }),
  ).toBeVisible();
  return { purchases: () => purchases };
}

test("desktop keeps the chat list beside a full-height conversation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await fixture(page);
  await page.locator(".chat-list-item").click();
  await expect(page.getByLabel("Сообщение", { exact: true })).toBeVisible();
  await expect(page.locator(".conversation-list")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeVisible();
  const layout = await page.evaluate(() => {
    const list = document
      .querySelector(".conversation-list")!
      .getBoundingClientRect();
    const chat = document
      .querySelector(".conversation-screen")!
      .getBoundingClientRect();
    const composer = document
      .querySelector(".composer")!
      .getBoundingClientRect();
    return {
      adjacent: chat.left >= list.right && chat.left - list.right <= 12,
      wide: chat.width > 650,
      visibleComposer: composer.bottom <= innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(layout).toEqual({
    adjacent: true,
    wide: true,
    visibleComposer: true,
    overflow: false,
  });
});

test("mobile switches between list and chat and keeps navigation out of the composer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await expect(page.locator(".conversation-placeholder")).toBeHidden();
  await expect(page.locator(".mobile-nav")).toBeVisible();
  await page.locator(".chat-list-item").click();
  await expect(page.getByLabel("Сообщение", { exact: true })).toBeVisible();
  await expect(page.locator(".conversation-list")).toBeHidden();
  await expect(page.locator(".mobile-nav")).toBeHidden();
  expect(
    await page
      .locator(".composer")
      .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.locator(".conversation-list")).toBeVisible();
  await expect(page.locator(".mobile-nav")).toBeVisible();
});

test("feed, profile, wallet and settings fit small phones, tablets and large desktops", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fixture(page);
  for (const width of [320, 820, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [tab, heading] of [
      ["Лента", "Лента"],
      [width <= 760 ? "Профиль" : "Мой профиль", "Мой профиль"],
      ["Кошелёк", "Кошелёк"],
      ["Настройки", "Настройки"],
    ]) {
      const nav =
        width <= 760
          ? ".mobile-nav"
          : tab === "Настройки"
            ? ".side-utilities"
            : ".sidebar nav";
      await page
        .locator(nav)
        .getByRole("button", { name: tab, exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${width}px: ${tab}`,
      ).toBeTruthy();
      if (heading === "Мой профиль") {
        await expect(
          page
            .locator(".profile-details")
            .getByRole("link", { name: "Сайт сообщества" }),
        ).toHaveAttribute("href", "https://example.com/nimb");
      }
    }
  }
  expect(errors).toEqual([]);
});

test("ordinary accounts have no administration entry in navigation, profile or settings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await fixture(page, false);
  await expect(page.getByRole("button", { name: /Админ-панель/ })).toHaveCount(
    0,
  );
  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "Мой профиль", exact: true })
    .click();
  await expect(page.locator(".profile-identity")).toBeVisible();
  await expect(page.locator(".profile-admin-link")).toHaveCount(0);
  await page
    .locator(".side-utilities")
    .getByRole("button", { name: "Настройки", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Настройки", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".admin-entry")).toHaveCount(0);
});

test("settings keep desktop navigation and switch to a back button on phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await fixture(page);
  await page
    .locator(".side-utilities")
    .getByRole("button", { name: "Настройки", exact: true })
    .click();
  const menu = page.getByRole("complementary", { name: "Разделы настроек" });
  await menu.getByRole("button", { name: "Шрифты", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Шрифты", exact: true }),
  ).toBeVisible();
  await expect(menu).toBeVisible();
  await page.getByLabel("Шрифт", { exact: true }).selectOption("Rubik");
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.fonts.check("14px Rubik")),
  ).toBeTruthy();
  await menu.getByRole("button", { name: "Оформление", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Оформление", exact: true }),
  ).toBeVisible();
  await expect(menu).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(menu).toBeHidden();
  await page
    .getByRole("button", { name: "Все настройки", exact: true })
    .click();
  await expect(menu).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Оформление", exact: true }),
  ).toBeVisible();
});

test("illustrated gift details show actual ownership and preserve the pin action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page, false);
  await page.route("**/api/users/1/gifts", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        gifts: [
          {
            id: 42,
            template: "moon",
            name: "Moon Pendant",
            icon: "☾",
            rarity: "Особенный",
            color: "mint",
            description: "Золотая подвеска с луной и звездой.",
            ownerId: 1,
            pinned: false,
            receivedAt: "2026-11-20T12:00:00Z",
            sender: { name: "Алексей", username: "alex" },
          },
        ],
      }),
    }),
  );
  let pin: unknown;
  await page.route("**/api/gifts/42/pin", async (route) => {
    pin = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: '{"ok":true}',
    });
  });
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Профиль", exact: true })
    .click();
  await expect(page.locator(".gift-tile .gift-artwork")).toBeVisible();
  await page.locator(".gift-tile").click();
  const detail = page.getByRole("dialog", {
    name: "Moon Pendant",
    exact: true,
  });
  await expect(detail.locator(".gift-artwork")).toBeVisible();
  await expect(detail.locator(".gift-artwork > img")).toHaveJSProperty(
    "complete",
    true,
  );
  expect(
    await detail
      .locator(".gift-artwork > img")
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  await expect(detail.locator(".gift-animation svg")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(detail.locator(".gift-artwork")).not.toHaveClass(/is-playing/);
  await expect(detail.locator(".gift-artwork > img")).toHaveCSS("opacity", "1");
  await expect(detail.locator(".gift-animation svg")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(detail.locator(".gift-animation svg")).toBeVisible();
  await expect(detail.locator(".gift-facts")).toContainText("#42");
  await expect(detail.locator(".gift-facts")).toContainText("ID 1");
  await expect(detail.locator(".gift-facts")).toContainText("@alex");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "/tmp/nimb-ref-phone-gift.png" });
  await detail
    .getByRole("button", { name: "Закрепить в профиле", exact: true })
    .click();
  await expect(detail).toBeHidden();
  expect(pin).toEqual({ pinned: true });
});

test("wallet requires confirmation and Escape cancels without purchasing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page);
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Кошелёк", exact: true })
    .click();
  await page.getByLabel("Юзернейм или номер").fill("777");
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await page.getByRole("button", { name: "Купить", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(state.purchases()).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.purchases()).toBe(0);
  await page.getByRole("button", { name: "Купить", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Купить юзернейм", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Коллекция обновлена" }),
  ).toBeVisible();
  expect(state.purchases()).toBe(1);
});

test("a delayed send cannot clear a draft in another conversation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await fixture(page, true, true);
  let complete: (() => void) | undefined;
  await page.route("**/api/chats/1/messages", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await new Promise<void>((resolve) => {
      complete = resolve;
    });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        message: {
          id: 50,
          chatId: 1,
          senderId: 1,
          text: "Первое сообщение",
          createdAt: new Date().toISOString(),
        },
      }),
    });
  });
  await page
    .locator(".chat-list-item")
    .filter({ has: page.getByText("Собеседник", { exact: true }) })
    .click();
  await page.getByLabel("Сообщение", { exact: true }).fill("Первое сообщение");
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect.poll(() => !!complete).toBe(true);
  await page
    .locator(".chat-list-item")
    .filter({ hasText: "Другой собеседник" })
    .click();
  await page
    .getByLabel("Сообщение", { exact: true })
    .fill("Черновик другого чата");
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/chats/1/messages") &&
      r.request().method() === "POST",
  );
  complete!();
  await response;
  await expect(page.getByLabel("Сообщение", { exact: true })).toHaveValue(
    "Черновик другого чата",
  );
  await page
    .locator(".chat-list-item")
    .filter({ has: page.getByText("Собеседник", { exact: true }) })
    .click();
  await expect(page.getByLabel("Сообщение", { exact: true })).toHaveValue("");
  await page
    .locator(".chat-list-item")
    .filter({ hasText: "Другой собеседник" })
    .click();
  await expect(page.getByLabel("Сообщение", { exact: true })).toHaveValue(
    "Черновик другого чата",
  );
});

test("refresh restores the tab, settings page and selected conversation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Лента", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Лента", exact: true }),
  ).toBeVisible();
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Настройки", exact: true })
    .click();
  await page.getByRole("button", { name: "Шрифты", exact: true }).click();
  await page.getByLabel("Размер текста").selectOption("large");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Шрифты", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Размер текста")).toHaveValue("large");
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Чаты", exact: true })
    .click();
  await page.locator(".chat-list-item").click();
  await page.reload();
  await expect(page.getByLabel("Сообщение", { exact: true })).toBeVisible();
  await expect(page.locator(".chat-header")).toContainText("Собеседник");
});

test("stored navigation is scoped to the account and cannot expose admin", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "nimb_navigation_1",
      JSON.stringify({ tab: "admin", setting: "Администрирование" }),
    );
    localStorage.setItem(
      "nimb_navigation_999",
      JSON.stringify({ tab: "wallet" }),
    );
  });
  await fixture(page, false);
  await expect(page.locator(".admin-console")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Сообщения", exact: true }),
  ).toBeVisible();
});

test("drafts survive a reload and remain separate between conversations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page, true, true);
  await page.locator(".chat-list-item").first().click();
  await page
    .getByLabel("Сообщение", { exact: true })
    .fill("Незаконченная мысль");
  await page.reload();
  await expect(page.getByLabel("Сообщение", { exact: true })).toHaveValue(
    "Незаконченная мысль",
  );
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.locator(".chat-list-item").first()).toContainText(
    "Черновик: Незаконченная мысль",
  );
  await page.locator(".chat-list-item").nth(1).click();
  await expect(page.getByLabel("Сообщение", { exact: true })).toHaveValue("");
});

test("Telegram gift posters stay inside three-column cards at phone and desktop sizes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page, false);
  const collection = Object.entries(gifts).map(([template, gift], index) => ({
    ...gift,
    template,
    id: index + 1,
    ownerId: 1,
    pinned: index === 0,
    receivedAt: "2026-11-20T12:00:00Z",
    sender: null,
  }));
  await page.route("**/api/users/1/gifts", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ gifts: collection }),
    }),
  );
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Профиль", exact: true })
    .click();
  await expect(page.locator(".gift-tile")).toHaveCount(8);
  for (const image of await page
    .locator(".gift-tile .gift-artwork > img")
    .all()) {
    await expect(image).toHaveJSProperty("complete", true);
    expect(
      await image.evaluate((node: HTMLImageElement) => node.naturalWidth),
    ).toBeGreaterThan(0);
  }
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const boxes = await page.locator(".gift-tile").evaluateAll((tiles) =>
      tiles.map((tile) => {
        const bounds = tile.getBoundingClientRect();
        const grid = tile.parentElement!.getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          gridLeft: grid.left,
          gridRight: grid.right,
        };
      }),
    );
    expect(
      boxes.every(
        (box) => box.left >= box.gridLeft - 1 && box.right <= box.gridRight + 1,
      ),
      String(width),
    ).toBeTruthy();
    expect(
      boxes[0].right <= boxes[1].left && boxes[1].right <= boxes[2].left,
      String(width),
    ).toBeTruthy();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  for (const gift of collection) {
    await page.locator(".gift-tile").filter({ hasText: gift.name }).click();
    const detail = page.getByRole("dialog", { name: gift.name, exact: true });
    await expect(detail.locator(".gift-artwork.is-playing")).toBeVisible();
    expect(
      await detail.locator(".gift-animation svg path").count(),
    ).toBeGreaterThan(0);
    await detail.getByRole("button", { name: "Закрыть", exact: true }).click();
    await expect(detail).toBeHidden();
  }
  await expect(page.locator(".gift-animation")).toHaveCount(0);
});

test("desktop menu expands, preserves the current conversation and closes after navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await fixture(page);
  await page.locator(".chat-list-item").click();
  await expect(page.getByLabel("Сообщение", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Развернуть меню", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Свернуть меню", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.locator(".sidebar nav").getByText("Сообщения", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Сообщение", { exact: true })).toBeVisible();
  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "Кошелёк", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Кошелёк", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Развернуть меню", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "Сообщения", exact: true })
    .click();
  await expect(page.locator(".conversation-list")).toBeVisible();
  await page.locator(".chat-list-item").click();
  await expect(page.getByLabel("Сообщение", { exact: true })).toBeVisible();
});

test("wallet filters owned names and numbers without changing ownership or active addresses", async ({
  page,
}) => {
  await fixture(page);
  const mutations: string[] = [];
  await page.route("**/api/wallet**", async (route) => {
    if (route.request().method() !== "GET")
      mutations.push(route.request().url());
    await route.fulfill({
      json: {
        balance: 8000,
        username: "owner",
        collectibleNumber: "+666",
        owned: [
          {
            username: "neo",
            price: 1000,
            public: true,
            purchasedAt: "2026-11-15T10:00:00Z",
          },
          {
            username: "+666",
            price: 1000,
            public: true,
            purchasedAt: "2026-11-15T10:00:00Z",
          },
        ],
      },
    });
  });
  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "Кошелёк", exact: true })
    .click();
  await expect(page.locator(".wallet-ownership-item")).toHaveCount(2);
  const tabs = page.getByRole("tablist", { name: "Коллекция адресов" });
  await tabs.getByRole("tab", { name: "Номера", exact: true }).click();
  await expect(page.locator(".wallet-ownership-item")).toHaveCount(1);
  await expect(page.locator(".wallet-owned")).toContainText("+666");
  await expect(page.locator(".wallet-public-option input")).toBeDisabled();
  await tabs.getByRole("tab", { name: "Имена", exact: true }).click();
  await expect(page.locator(".wallet-owned")).toContainText("@neo");
  await expect(page.locator(".wallet-public-option input")).toBeChecked();
  await tabs.getByRole("tab", { name: "Все", exact: true }).click();
  await expect(page.locator(".wallet-ownership-item")).toHaveCount(2);
  expect(mutations).toEqual([]);
});
