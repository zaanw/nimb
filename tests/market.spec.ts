import { test, expect } from "@playwright/test";
import { redesignFixture } from "./fixtures/redesign";
import { navigate } from "./navigation";

test("market confirms purchases and reuses the same receipt after a lost response", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 950 });
  const state = await redesignFixture(page, {
    balance: 2000,
    failFirstPurchase: true,
  });
  await page.goto("/?tab=market");
  const item = page.getByRole("button", {
    name: "Hanging Star, 50 нимбиков",
    exact: true,
  });
  await item.click();
  await page
    .getByRole("dialog", { name: "Hanging Star", exact: true })
    .getByRole("button", { name: "Закрыть", exact: true })
    .click();
  expect(state.purchases).toHaveLength(0);
  await item.click();
  const buy = page.getByRole("button", { name: "Купить за 50 N", exact: true });
  await buy.click();
  await expect(page.getByRole("alert")).toContainText("Ответ потерян");
  await buy.click();
  const detail = page.getByRole("dialog", {
    name: "Hanging Star",
    exact: true,
  });
  await expect(detail.locator(".collectible-facts")).toContainText("#125");
  await expect(detail.locator(".collectible-facts")).toContainText("Sapphire");
  await expect(detail.locator(".collectible-facts")).toContainText("Stars");
  expect(state.purchases).toHaveLength(2);
  expect(state.purchases[0].requestId).toBe(state.purchases[1].requestId);
  expect(state.balance()).toBe(1950);
  expect(state.owned.filter((gift) => gift.id === 900)).toHaveLength(1);
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(item).toBeFocused();
});

test("market tab and search survive reload; tabs support arrow keys", async ({
  page,
}) => {
  await redesignFixture(page);
  await page.goto("/?tab=market");
  const shop = page.getByRole("tab", { name: "Подарки", exact: true });
  await shop.focus();
  await page.keyboard.press("ArrowRight");
  const collection = page.getByRole("tab", {
    name: "Моя коллекция",
    exact: true,
  });
  await expect(collection).toBeFocused();
  await expect(collection).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/market-view=collection/);
  await page.getByLabel("Поиск подарков", { exact: true }).fill("Pepe");
  await expect(page.locator(".market-owned-grid .gift-tile")).toHaveCount(1);
  await page.reload();
  await expect(collection).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Поиск подарков", { exact: true })).toHaveValue(
    "Pepe",
  );
  await page.locator(".gift-tile").click();
  await expect(
    page
      .getByRole("dialog", { name: "Plush Pepe", exact: true })
      .locator(".gift-facts"),
  ).toContainText("#18");
  await page.keyboard.press("Escape");
  await page
    .getByLabel("Поиск подарков", { exact: true })
    .fill("нет-такого-подарка");
  await expect(
    page.getByText("Ничего не найдено.", { exact: true }),
  ).toBeVisible();
});

test("insufficient funds prevent a purchase and the wallet link stays usable on phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const state = await redesignFixture(page, { balance: 20 });
  await page.goto("/");
  await navigate(page, "Маркет");
  await page
    .getByRole("button", { name: "Hanging Star, 50 нимбиков", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Купить за 50 N", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Недостаточно нимбиков", { exact: false }),
  ).toBeVisible();
  expect(state.purchases).toHaveLength(0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Открыть кошелёк", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Кошелёк", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".mobile-nav button.active")).toHaveAttribute(
    "aria-label",
    "Маркет",
  );
});

test("catalog errors can be retried, without a fake empty grid", async ({
  page,
}) => {
  await redesignFixture(page);
  await page.route("**/api/market/catalog", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Каталог временно недоступен" },
    }),
  );
  await page.goto("/?tab=market");
  await expect(
    page.getByText("Каталог временно недоступен", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.unroute("**/api/market/catalog");
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.locator(".market-item")).toHaveCount(8);
});

test("market filters catalog gifts and sorts the loaded collection by serial", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await redesignFixture(page);
  await page.goto("/?tab=market");
  const market = page.locator(".market-screen");
  const filters = market.locator(".market-filters");
  await filters.getByLabel("Редкость").selectOption("Редкий");
  await filters.getByLabel("Сортировка").selectOption("price-desc");
  const offers = market.locator(".market-grid .market-item");
  await expect(offers).toHaveCount(2);
  await expect(offers.first()).toContainText("Stellar Rocket");
  await expect(offers.last()).toContainText("Pretty Posy");
  await market.getByRole("tab", { name: "Моя коллекция" }).click();
  await filters.getByLabel("Сортировка").selectOption("number");
  await expect(
    market.locator(".market-owned-grid .gift-tile").first(),
  ).toHaveAccessibleName("Plush Pepe #18");
});
