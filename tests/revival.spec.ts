import { expect, test } from "@playwright/test";
import { redesignFixture } from "./fixtures/redesign";
import { navigate } from "./navigation";

function pageOfMessages(first: number, length: number) {
  return Array.from({ length }, (_, index) => ({
    id: first + index,
    chatId: 1,
    senderId: index % 2 ? 1 : 2,
    text: `Сообщение ${first + index}`,
    createdAt: new Date(Date.UTC(2026, 10, 22, 10, index)).toISOString(),
    reactions: [],
  }));
}

test("loading older history preserves the visible message in a long thread", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await redesignFixture(page);
  await page.route("**/api/chats/1/messages**", async (route) => {
    const older = new URL(route.request().url()).searchParams.has("before");
    await route.fulfill({
      json: {
        messages: older ? pageOfMessages(1, 50) : pageOfMessages(51, 50),
        nextCursor: older ? null : 51,
      },
    });
  });
  await page.goto("/");
  await page.locator(".chat-list-item").click();
  const area = page.locator(".message-area");
  const oldest = area.getByText("Сообщение 51", { exact: true });
  await expect(oldest).toBeAttached();
  await expect
    .poll(() => area.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await area.evaluate((element) => {
    element.scrollTop = 0;
  });
  const before = (await oldest.boundingBox())!.y;
  await area
    .getByRole("button", { name: "Загрузить ранние сообщения" })
    .click();
  await expect(area.getByText("Сообщение 1", { exact: true })).toBeAttached();
  await expect
    .poll(async () => Math.abs((await oldest.boundingBox())!.y - before))
    .toBeLessThan(45);
  await expect(oldest).toBeInViewport();
});

test("profile badges describe their purpose on keyboard focus and tap", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await redesignFixture(page);
  await page.goto("/");
  await navigate(page, "Профиль");
  const badges = page.getByRole("region", { name: "Значки профиля" });
  const verified = badges.getByRole("button", {
    name: "Verified",
    exact: true,
  });
  await verified.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(verified).toBeFocused();
  await expect(badges.getByRole("tooltip")).toContainText(
    "подлинность аккаунта",
  );
  await expect(verified).toHaveAccessibleDescription(/подлинность аккаунта/);
  await verified.click();
  await expect(
    page.getByRole("dialog", { name: "Verified", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(verified).toBeFocused();
});

test("mobile composer stays inside the visible viewport after resizing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await redesignFixture(page);
  await page.goto("/");
  await page.locator(".chat-list-item").click();
  const composer = page.getByRole("textbox", {
    name: "Сообщение",
    exact: true,
  });
  await composer.focus();
  await page.setViewportSize({ width: 390, height: 520 });
  await expect
    .poll(() =>
      composer.evaluate((element) => element.getBoundingClientRect().bottom),
    )
    .toBeLessThanOrEqual(520);
  await expect(page.locator(".chat-header")).toBeInViewport();
  await expect(composer).toBeFocused();
});
