import { test, expect, type Page } from "@playwright/test";

async function fixture(
  page: Page,
  permission: "granted" | "denied" = "granted",
  iphone = false,
) {
  await page.addInitScript(
    ({ permission, iphone }) => {
      const pub = "B" + "A".repeat(86);
      const listeners: ((e: any) => void)[] = [];
      (window as any).permissionPrompts = 0;
      const Subscription = () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/browser-ui",
        options: {
          applicationServerKey: Uint8Array.from(
            atob((pub + "=").replace(/-/g, "+").replace(/_/g, "/")),
            (c) => c.charCodeAt(0),
          ).buffer,
        },
        toJSON() {
          return {
            endpoint: this.endpoint,
            keys: { p256dh: pub, auth: "A".repeat(22) },
          };
        },
        unsubscribe: async () => {
          localStorage.removeItem("mock-push-sub");
          return true;
        },
      });
      const registration = {
        active: {},
        pushManager: {
          getSubscription: async () =>
            localStorage.getItem("mock-push-sub") ? Subscription() : null,
          subscribe: async () => {
            localStorage.setItem("mock-push-sub", "true");
            return Subscription();
          },
        },
        showNotification: async () => {},
      };
      const worker = {
        controller: { postMessage: () => {} },
        getRegistration: async () => registration,
        register: async () => registration,
        ready: Promise.resolve(registration),
        addEventListener: (event: string, handler: (e: any) => void) => {
          if (event === "message") listeners.push(handler);
        },
        removeEventListener: () => {},
      };
      Object.defineProperty(navigator, "serviceWorker", {
        value: worker,
        configurable: true,
      });
      Object.defineProperty(window, "PushManager", {
        value: function () {},
        configurable: true,
      });
      class FakeNotification {
        static get permission() {
          return localStorage.getItem("mock-permission") || "default";
        }
        static async requestPermission() {
          (window as any).permissionPrompts++;
          localStorage.setItem("mock-permission", permission);
          return permission;
        }
      }
      Object.defineProperty(window, "Notification", {
        value: FakeNotification,
        configurable: true,
      });
      if (iphone) {
        Object.defineProperty(navigator, "userAgent", {
          get: () =>
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        });
        Object.defineProperty(navigator, "standalone", { value: false });
      }
      (window as any).openPushChat = (id: number) =>
        listeners.forEach((handler) =>
          handler({ data: { type: "OPEN_CHAT", chatId: id } }),
        );
    },
    { permission, iphone },
  );
  const user = {
    id: 1,
    name: "zaan",
    username: "zaan",
    bio: "",
    createdAt: "2026-11-16T10:00:00Z",
  };
  const other = { ...user, id: 2, name: "Марк", username: "mark" };
  let subscribed = false;
  let tests = 0;
  let posts = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api", "");
    let data: any = { ok: true };
    if (path === "/me") data = { user, isAdmin: true };
    else if (path === "/chats")
      data = {
        chats: [
          {
            id: 1,
            kind: "direct",
            members: [
              { user, role: "member", lastReadId: 0 },
              { user: other, role: "member", lastReadId: 0 },
            ],
            messages: [],
          },
        ],
      };
    else if (path === "/folders") data = { folders: [] };
    else if (path === "/chats/1/messages")
      data = { messages: [], nextCursor: null };
    else if (path === "/push/status") data = { configured: true, subscribed };
    else if (path === "/push/public-key")
      data = { publicKey: "B" + "A".repeat(86) };
    else if (path === "/push/subscriptions") {
      if (route.request().method() === "POST") {
        subscribed = true;
        posts++;
      } else subscribed = false;
    } else if (path === "/push/test") tests++;
    else if (path.endsWith("/badges")) data = { badges: [] };
    else if (path.endsWith("/gifts")) data = { gifts: [] };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Чаты", exact: true }),
  ).toBeVisible();
  return {
    subscribed: () => subscribed,
    tests: () => tests,
    posts: () => posts,
  };
}
async function settings(page: Page) {
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Настройки", exact: true })
    .click();
  await page.getByRole("button", { name: "Уведомления", exact: true }).click();
}
test("push can be enabled, tested, restored after refresh and disabled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page);
  await settings(page);
  const toggle = page.getByLabel("Push-уведомления", { exact: true });
  await expect(toggle).toBeEnabled();
  await toggle.check();
  await expect(page.getByRole("status")).toContainText("Push включён");
  expect(state.subscribed()).toBe(true);
  expect(await page.evaluate(() => (window as any).permissionPrompts)).toBe(1);
  await page
    .getByRole("button", { name: "Проверить уведомление", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Тест отправлен");
  expect(state.tests()).toBe(1);
  await page.reload();
  await expect(toggle).toBeChecked();
  expect(state.posts()).toBeGreaterThanOrEqual(2);
  await toggle.uncheck();
  await expect(page.getByRole("status")).toContainText("Push отключён");
  expect(state.subscribed()).toBe(false);
  await page.screenshot({ path: "/tmp/nimb-push-settings-phone.png" });
});
test("denied browser permission shows instructions and never registers push", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page, "denied");
  await settings(page);
  const toggle = page.getByLabel("Push-уведомления", { exact: true });
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(page.getByRole("alert")).toContainText(
    "Разрешите их в настройках",
  );
  await expect(toggle).not.toBeChecked();
  expect(state.posts()).toBe(0);
});
test("iPhone browser explains Home Screen installation before enabling push", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page, "granted", true);
  await settings(page);
  await expect(
    page.getByText("На iPhone — через приложение", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Push-уведомления", { exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => (window as any).permissionPrompts)).toBe(0);
});
test("push links and worker clicks open the authorised conversation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.evaluate(() =>
    localStorage.setItem(
      "nimb_navigation_1",
      JSON.stringify({ tab: "settings" }),
    ),
  );
  await page.goto("/?chat=1");
  await expect(page.getByLabel("Сообщение", { exact: true })).toBeVisible();
  await expect(page.locator(".chat-header")).toContainText("Марк");
  expect(new URL(page.url()).searchParams.has("chat")).toBe(false);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await settings(page);
  await page.evaluate(() => (window as any).openPushChat(1));
  await expect(page.getByLabel("Сообщение", { exact: true })).toBeVisible();
  await page.goto("/?chat=99999");
  await expect(
    page.getByText("Переписка из уведомления недоступна для этого аккаунта.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Сообщение", { exact: true })).toHaveCount(0);
});
