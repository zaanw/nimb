import { openNavigation } from "./navigation";
import { test, expect, type Page } from "@playwright/test";

async function adminFixture(page: Page) {
  const people = [
    {
      id: 2,
      name: "test",
      username: "test",
      nimbBalance: 2500,
      suspended: false,
      isAdmin: false,
      createdAt: "2026-11-15T10:00:00Z",
    },
    {
      id: 1,
      name: "zaan",
      username: "zaan",
      nimbBalance: 12500,
      suspended: false,
      isAdmin: true,
      createdAt: "2026-11-15T08:00:00Z",
    },
  ];
  const gifts = [
    ["star", "Hanging Star", "✦", "blue"],
    ["heart", "Heart Locket", "♥", "rose"],
    ["flower", "Pretty Posy", "✿", "violet"],
    ["comet", "Stellar Rocket", "☄", "gold"],
    ["moon", "Moon Pendant", "☾", "mint"],
    ["diamond", "Astral Shard", "◆", "indigo"],
    ["pepe", "Plush Pepe", "🐸", "mint"],
    ["bear", "Toy Bear", "🧸", "rose"],
  ].map(([id, name, icon, color]) => ({
    id,
    name,
    icon,
    color,
    rarity: "Особенный",
  }));
  const requests: { path: string; body: any }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const events = [
    {
      id: "currency-1",
      kind: "currency",
      label: "Начисление нимбиков",
      value: "+2 500",
      createdAt: "2026-11-15T16:20:00Z",
      user: people[0],
      actor: people[1],
    },
    {
      id: "gift-1",
      kind: "gift",
      label: "Подарок",
      value: "Hanging Star",
      createdAt: "2026-11-15T16:10:00Z",
      user: people[0],
      actor: people[1],
    },
    {
      id: "username-1",
      kind: "username",
      label: "Выдача юзернейма",
      value: "@777",
      createdAt: "2026-11-15T16:00:00Z",
      user: people[1],
      actor: null,
    },
  ];
  const reports = [
    {
      id: 1,
      reason: "Спам в личных сообщениях",
      createdAt: "2026-11-15T16:00:00Z",
      reporter: people[1],
      reported: people[0],
    },
  ];
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace("/api", "");
    let data: any = { ok: true },
      status = 200;
    if (req.method() !== "GET") {
      const body = req.postDataJSON();
      requests.push({ path, body });
      if (path.endsWith("/currency")) {
        const target = people.find((u) => u.id === Number(path.split("/")[3]))!;
        target.nimbBalance += body.amount;
      }
      if (path.endsWith("/username") && body.username === "77") {
        status = 409;
        data = { error: "Этот юзернейм уже занят" };
      }
      if (path.endsWith("/resolve")) reports.splice(0);
      if (path.endsWith("/suspension")) people[0].suspended = body.suspended;
    } else if (path === "/me") data = { user: people[1], isAdmin: true };
    else if (path === "/chats") data = { chats: [] };
    else if (path === "/folders") data = { folders: [] };
    else if (path === "/admin/overview")
      data = {
        users: 2,
        communities: 0,
        openReports: reports.length,
        newUsers: 2,
        totalBalance: people.reduce((n, u) => n + u.nimbBalance, 0),
        gifts: 1,
      };
    else if (path === "/admin/users") {
      const q = (url.searchParams.get("q") || "").replace(/^@/, ""),
        state = url.searchParams.get("status");
      const users = people.filter(
        (u) =>
          (!q || u.username.includes(q) || String(u.id) === q) &&
          (state === "suspended"
            ? u.suspended
            : state === "active"
              ? !u.suspended
              : true),
      );
      data = { users, total: users.length, page: 1, pageSize: 20 };
    } else if (/^\/admin\/users\/\d+$/.test(path))
      data = {
        user: {
          ...people.find((u) => u.id === Number(path.split("/")[3])),
          purchasedUsernames: [{ username: "204" }],
          _count: { gifts: 1, purchasedUsernames: 1 },
        },
      };
    else if (path === "/admin/activity") data = { events };
    else if (path === "/admin/reports") data = { reports };
    else if (path === "/catalog/gifts") data = { templates: gifts };
    else if (/^\/users\/\d+\/badges$/.test(path)) data = { badges: [] };
    else if (/^\/users\/\d+\/gifts$/.test(path)) data = { gifts: [] };
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("/");
  // The desktop entry is also available to keyboard navigation on narrow screens.
  if ((page.viewportSize()?.width || 0) <= 760) {
    await page
      .locator(".mobile-nav")
      .getByRole("button", { name: "Профиль", exact: true })
      .click();
    await page.locator(".profile-admin-link").click();
  } else {
    await openNavigation(page);
    await page
      .locator(".side-utilities")
      .getByRole("button", { name: /Админ-панель/ })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: "Админ-панель", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Управлять @test" }),
  ).toBeVisible();
  return { requests, errors };
}

test("currency grant shows recipient and needs explicit confirmation, then updates balance", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { requests, errors } = await adminFixture(page);
  await page
    .getByRole("button", { name: "Выдать нимбики пользователю @test" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("@test · ID 2")).toBeVisible();
  await dialog.getByLabel("Количество нимбиков").fill("500");
  await dialog.getByRole("button", { name: "Продолжить" }).click();
  expect(requests).toHaveLength(0);
  await expect(dialog.getByText("+500", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Начислить нимбики" }).click();
  await expect(page.locator(".control-toast")).toContainText(
    "500 нимбиков начислено @test",
  );
  expect(requests).toEqual([
    { path: "/admin/users/2/currency", body: { amount: 500 } },
  ]);
  await expect(
    page.locator(".control-user-row").first().locator(".control-user-balance"),
  ).toContainText("3 000");
  expect(errors).toEqual([]);
});

test("gift picker selects the actual template; cancelling never sends a grant", async ({
  page,
}) => {
  const { requests } = await adminFixture(page);
  await page
    .getByRole("button", { name: "Отправить подарок пользователю @test" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Astral Shard/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Продолжить" })
    .click();
  await page.keyboard.press("Escape");
  expect(requests).toHaveLength(0);
  await page
    .getByRole("button", { name: "Отправить подарок пользователю @test" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Astral Shard/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Продолжить" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Отправить подарок" })
    .click();
  await expect(page.locator(".control-toast")).toContainText("Astral Shard");
  expect(requests).toEqual([
    { path: "/admin/users/2/gifts", body: { template: "diamond" } },
  ]);
});

test("username conflict stays in dialog and lets the admin correct the name", async ({
  page,
}) => {
  const { requests } = await adminFixture(page);
  await page
    .getByRole("button", { name: "Выдать юзернейм пользователю @test" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Юзернейм или номер").fill("77");
  await dialog.getByRole("button", { name: "Продолжить" }).click();
  await dialog
    .getByRole("button", { name: "Выдать юзернейм", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("уже занят");
  await dialog.getByRole("button", { name: "Назад", exact: true }).click();
  await dialog.getByLabel("Юзернейм или номер").fill("888");
  await dialog.getByRole("button", { name: "Продолжить" }).click();
  await dialog
    .getByRole("button", { name: "Выдать юзернейм", exact: true })
    .click();
  await expect(page.locator(".control-toast")).toContainText(
    "@888 добавлен в коллекцию @test",
  );
  expect(requests[1]).toEqual({
    path: "/admin/users/2/username",
    body: { username: "888" },
  });
});

test("search and status filter use the server, and closing a report refreshes the queue", async ({
  page,
}) => {
  const { requests } = await adminFixture(page);
  await page.getByLabel("Найти пользователя", { exact: true }).fill("@zaan");
  await expect(page.locator(".control-user-row")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Управлять @zaan" }),
  ).toBeVisible();
  await page.getByLabel("Статус пользователей").selectOption("suspended");
  await expect(
    page.getByRole("heading", { name: "Никого не нашли" }),
  ).toBeVisible();
  await page
    .locator(".control-tabs")
    .getByRole("button", { name: /Жалобы/ })
    .click();
  await expect(page.getByText("Спам в личных сообщениях")).toBeVisible();
  await page.getByRole("button", { name: "Закрыть жалобу" }).click();
  await expect(
    page.getByRole("heading", { name: "Все спокойно" }),
  ).toBeVisible();
  expect(requests[0]).toEqual({ path: "/admin/reports/1/resolve", body: {} });
});

test("admin, gift dialog and review fit phone, tablet and large desktop", async ({
  page,
}) => {
  const { errors } = await adminFixture(page);
  for (const width of [1920, 1440, 820, 390, 320]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1080 });
    await expect(page.locator(".control-shortcuts")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `/tmp/nimb-admin-v3-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Отправить подарок пользователю @test" })
      .click();
    await expect(
      page.getByRole("dialog").getByRole("button", { name: /Hanging Star/ }),
    ).toBeVisible();
    const box = await page.getByRole("dialog").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    if (width === 390)
      await page.screenshot({ path: "/tmp/nimb-admin-v3-gift-mobile.png" });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Продолжить" })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Отправить подарок" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
});

test("owner can save a point, preview a restore and cancel before applying", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await adminFixture(page);
  const points = [
    { id: 1, label: "Исходное состояние", createdAt: "2026-11-16T09:00:00Z" },
  ];
  let restores = 0;
  let resets = 0;
  await page.route("**/api/admin/users/2/checkpoints**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: any = { ok: true };
    if (path.endsWith("/preview"))
      data = {
        point: points[0],
        token: "a".repeat(64),
        changes: {
          balance: { before: 2500, after: 0 },
          gifts: { before: 1, after: 0 },
          names: { before: ["777"], after: [] },
          badges: { before: ["bug_hunter"], after: [] },
          plus: { before: true, after: false },
          stats: {
            before: { messages: 15, posts: 3 },
            after: { messages: 2, posts: 1 },
          },
        },
      };
    else if (path.endsWith("/restore")) {
      restores++;
      data = { ok: true, backupId: 3 };
      points.unshift({
        id: 3,
        label: "Перед откатом",
        createdAt: "2026-11-16T10:00:00Z",
      });
    } else if (route.request().method() === "POST") {
      points.unshift({
        id: 2,
        label: path.endsWith("/reset-all")
          ? "Нулевые статы"
          : route.request().postDataJSON().label,
        createdAt: "2026-11-16T09:30:00Z",
      });
      data = { point: points[0] };
    } else
      data = {
        points,
        stats: {
          messages: 15,
          posts: 3,
          comments: 0,
          reactions: 1,
          followers: 0,
          following: 0,
        },
      };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.route("**/api/admin/users/2/stats/reset", async (route) => {
    resets++;
    await route.fulfill({
      contentType: "application/json",
      body: '{"ok":true}',
    });
  });
  await page.getByRole("button", { name: "Откат статов", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Откат статов", exact: true });
  await expect(panel).toBeVisible();
  await panel.getByLabel("Сохранить текущее состояние").fill("Перед тестом");
  await panel
    .getByRole("button", { name: "Сохранить точку", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "Точка восстановления создана",
  );
  await panel
    .locator(".checkpoint-row")
    .filter({ hasText: "Исходное состояние" })
    .click();
  await expect(panel.locator("table")).toContainText("Нимбики");
  await expect(panel.locator("table")).toContainText("2500");
  await panel
    .getByRole("button", { name: "Применить откат", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  expect(restores).toBe(0);
  await panel
    .getByRole("button", { name: "Применить откат", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Применить откат?", exact: true })
    .getByRole("button", { name: "Применить откат", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("Статы восстановлены");
  expect(restores).toBe(1);
  await panel
    .getByRole("button", { name: "Обнулить счётчики", exact: true })
    .click();
  await page.keyboard.press("Escape");
  expect(resets).toBe(0);
  await panel
    .getByRole("button", { name: "Обнулить все статы", exact: true })
    .click();
  await expect(panel.locator("table")).toContainText("Нимбики");
  expect(restores).toBe(1);
  await panel.getByRole("button", { name: "Отмена", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "/tmp/nimb-stat-rollback-phone.png" });
});

test("owner can ban a browser, cancel an IP ban, and revoke the browser ban on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await adminFixture(page);
  const records: any[] = [];
  let revoked = 0;
  await page.route("**/api/admin/network/status", async (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        peer: "172.17.0.1",
        clientIp: "198.51.100.1",
        publicClientIp: true,
        trusted: true,
        canTrust: false,
      }),
    }),
  );
  await page.route("**/api/admin/users/2/network**", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      records.push({
        id: 1,
        ...body,
        createdAt: "2026-11-17T09:00:00Z",
        expiresAt: null,
        revokedAt: null,
        active: true,
      });
      await route.fulfill({
        contentType: "application/json",
        body: '{"ok":true}',
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: 2, name: "test", username: "test" },
        isAdmin: false,
        devices: [
          {
            id: 1,
            ip: "203.0.113.10",
            deviceHash: "a".repeat(64),
            label: "Safari · iOS",
            firstSeen: "2026-11-17T08:00:00Z",
            lastSeen: "2026-11-17T09:00:00Z",
            publicIp: true,
          },
        ],
        bans: records,
      }),
    });
  });
  await page.route("**/api/admin/network/bans/1/revoke", async (route) => {
    revoked++;
    records[0].active = false;
    records[0].revokedAt = "2026-11-17T10:00:00Z";
    await route.fulfill({
      contentType: "application/json",
      body: '{"ok":true}',
    });
  });
  await page
    .getByRole("button", { name: "Бан по IP и браузеру", exact: true })
    .click();
  const panel = page.getByRole("dialog", {
    name: "Бан по IP и браузеру",
    exact: true,
  });
  await expect(panel).toContainText("Safari · iOS");
  await panel.getByRole("button", { name: "Бан IP", exact: true }).click();
  await panel.getByLabel("Причина", { exact: true }).fill("Повторный спам");
  await panel
    .getByRole("button", { name: "Заблокировать", exact: true })
    .click();
  await page.keyboard.press("Escape");
  expect(records).toHaveLength(0);
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Отмена", exact: true }).click();
  await panel
    .getByRole("button", { name: "Бан браузера", exact: true })
    .click();
  await panel.getByLabel("Причина", { exact: true }).fill("Обход блокировки");
  await panel
    .getByLabel("Срок блокировки", { exact: true })
    .selectOption("forever");
  await panel
    .getByRole("button", { name: "Заблокировать", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Заблокировать браузер?", exact: true })
    .getByRole("button", { name: "Заблокировать", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("Блокировка включена");
  expect(records[0].kind).toBe("device");
  expect(records[0].hours).toBe(null);
  await page.screenshot({ path: "/tmp/nimb-network-bans-phone.png" });
  await panel
    .getByRole("button", { name: "Снять блокировку", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Снять блокировку?", exact: true })
    .getByRole("button", { name: "Снять блокировку", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("Блокировка снята");
  expect(revoked).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("owner can confirm a deduction and reclaim a primary username on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await adminFixture(page);
  const user = {
    id: 2,
    name: "test",
    username: "test",
    collectibleNumber: "+666",
    nimbBalance: 2500,
    purchasedUsernames: [
      { username: "204", price: 1000 },
      { username: "+666", price: 0 },
    ],
  };
  const history: any[] = [];
  const requests: any[] = [];
  await page.route("**/api/admin/users/2/reclaims", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      requests.push(body);
      const before = user.nimbBalance;
      let replacementUsername = null;
      if (body.kind === "currency") user.nimbBalance -= body.amount;
      else {
        replacementUsername = "nimb_2_1234abcd";
        user.username = replacementUsername;
      }
      history.unshift({
        id: history.length + 1,
        ...body,
        value: body.kind === "currency" ? String(body.amount) : body.username,
        balanceBefore: before,
        balanceAfter: user.nimbBalance,
        replacementUsername,
        createdAt: "2026-11-17T15:00:00Z",
      });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          balance: user.nimbBalance,
          replacementUsername,
        }),
      });
    } else
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ user, history }),
      });
  });
  await page
    .getByRole("button", { name: "Списать нимбики", exact: true })
    .click();
  let panel = page.getByRole("dialog", {
    name: "Списать нимбики",
    exact: true,
  });
  await expect(panel).toContainText("2 500 N");
  await panel.getByLabel("Сумма списания", { exact: true }).fill("2501");
  await panel
    .getByLabel("Причина", { exact: true })
    .fill("Ошибочное начисление");
  await expect(
    panel.getByRole("button", { name: "Списать нимбики", exact: true }),
  ).toBeDisabled();
  await panel.getByLabel("Сумма списания", { exact: true }).fill("500");
  await panel
    .getByRole("button", { name: "Списать нимбики", exact: true })
    .click();
  let confirmation = page.getByRole("dialog", {
    name: "Подтвердить списание?",
    exact: true,
  });
  await expect(confirmation).toContainText("2 500 → 2 000 N");
  await confirmation
    .getByRole("button", { name: "Отмена", exact: true })
    .click();
  expect(requests).toHaveLength(0);
  await panel
    .getByRole("button", { name: "Списать нимбики", exact: true })
    .click();
  await confirmation
    .getByRole("button", { name: "Списать", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("Осталось 2 000 N");
  expect(requests[0]).toMatchObject({
    kind: "currency",
    amount: 500,
    expectedBalance: 2500,
    reason: "Ошибочное начисление",
  });
  expect(requests[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
  await panel.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page
    .getByRole("button", { name: "Забрать юзернейм или номер", exact: true })
    .click();
  panel = page.getByRole("dialog", {
    name: "Забрать юзернейм или номер",
    exact: true,
  });
  await panel
    .getByLabel("Юзернейм или номер", { exact: true })
    .selectOption("test");
  await expect(panel).toContainText("Основной логин изменится на технический");
  await panel
    .getByLabel("Причина", { exact: true })
    .fill("Отзыв спамного адреса");
  await panel
    .getByRole("button", { name: "Забрать адрес", exact: true })
    .click();
  confirmation = page.getByRole("dialog", {
    name: "Забрать адрес?",
    exact: true,
  });
  await expect(confirmation).toContainText(
    "Для следующего входа понадобится новый логин или email",
  );
  await confirmation
    .getByRole("button", { name: "Забрать адрес", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "Новый логин: @nimb_2_1234abcd",
  );
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({
    kind: "username",
    username: "test",
    reason: "Отзыв спамного адреса",
  });
  await expect(panel).toContainText("Отзыв спамного адреса");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "/tmp/nimb-reclaims-phone.png" });
});
