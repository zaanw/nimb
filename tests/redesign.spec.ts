import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { redesignFixture } from "./fixtures/redesign";
import { navigate } from "./navigation";

const evidence =
  process.env.NIMB_DESIGN_EVIDENCE || "/workspace/nimb-rooms-evidence";
test("all primary screens fit the four release widths, with screenshots and keyboard/motion checks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await redesignFixture(page);
  await page.goto("/");
  const measurements: unknown[] = [];
  for (const width of [375, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const directory = `${evidence}/after/${width}`;
    await mkdir(directory, { recursive: true });
    async function capture(screen: string) {
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator(".screen")).toHaveCSS("opacity", "1");
      await expect
        .poll(() =>
          page.locator(".gift-artwork img").evaluateAll((images) =>
            images
              .filter((image) => {
                const bounds = image.getBoundingClientRect();
                return (
                  bounds.top < innerHeight &&
                  bounds.bottom > 0 &&
                  bounds.width > 0
                );
              })
              .every(
                (image) =>
                  (image as HTMLImageElement).complete &&
                  (image as HTMLImageElement).naturalWidth > 0,
              ),
          ),
        )
        .toBe(true);
      const bounds = await page.evaluate(() => {
        const main = document.querySelector<HTMLElement>("main.main")!;
        return {
          pageOverflow: document.documentElement.scrollWidth > innerWidth,
          mainOverflow: main.scrollWidth > main.clientWidth + 1,
          mainWidth: main.clientWidth,
        };
      });
      expect(bounds.pageOverflow, `${width}px ${screen}: document`).toBe(false);
      expect(bounds.mainOverflow, `${width}px ${screen}: workspace`).toBe(
        false,
      );
      measurements.push({ width, screen, ...bounds });
      await page.screenshot({ path: `${directory}/${screen}.png` });
    }
    await navigate(page, width <= 760 ? "Чаты" : "Сообщения");
    await expect(page.locator(".conversation-placeholder")).toBeAttached();
    await capture("chat-list");
    await page.locator(".chat-list-item").click();
    await expect(page.getByLabel("Сообщение", { exact: true })).toBeVisible();
    expect(
      await page
        .locator(".composer")
        .evaluate(
          (element) => element.getBoundingClientRect().bottom <= innerHeight,
        ),
    ).toBe(true);
    await capture("chat");
    if (width <= 760)
      await page.getByRole("button", { name: "Назад", exact: true }).click();
    for (const [label, heading, file] of [
      ["Лента", "Лента", "feed"],
      [width <= 760 ? "Профиль" : "Мой профиль", "Мой профиль", "profile"],
      ["Маркет", "Маркет", "market"],
      ["Настройки", "Настройки", "settings"],
      ["Кошелёк", "Кошелёк", "wallet"],
    ]) {
      await navigate(page, label);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      if (file === "settings") {
        const rows = page.locator(".settings-group").first().locator("button");
        const bounds = await rows.evaluateAll((elements) =>
          elements.slice(0, 2).map((element) => {
            const rectangle = element.getBoundingClientRect();
            return { y: rectangle.y, bottom: rectangle.bottom };
          }),
        );
        expect(bounds[1].y).toBeGreaterThanOrEqual(bounds[0].bottom - 1);
      }
      if (file === "profile") {
        await expect(
          page.getByRole("button", { name: "Редактировать", exact: true }),
        ).toBeVisible();
        if (width > 760) {
          const dialog = page.getByRole("dialog", {
            name: heading,
            exact: true,
          });
          await expect(dialog).toBeVisible();
          expect(
            await dialog.evaluate(
              (element) => element.scrollWidth <= element.clientWidth + 1,
            ),
          ).toBe(true);
        }
      }
      await capture(file);
      if (file === "profile" && width === 375) {
        const edit = page.getByRole("button", {
          name: "Редактировать",
          exact: true,
        });
        await edit.click();
        const dialog = page.getByRole("dialog", {
          name: "Редактировать",
          exact: true,
        });
        await dialog
          .getByRole("button", { name: "Сохранить", exact: true })
          .focus();
        await page.keyboard.press("Tab");
        await expect(
          dialog.getByRole("button", { name: "Закрыть", exact: true }),
        ).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(edit).toBeFocused();
      }
      if (file === "market") {
        await page
          .getByRole("tab", { name: "Моя коллекция", exact: true })
          .click();
        await expect(page.locator(".market-owned-grid .gift-tile")).toHaveCount(
          8,
        );
        await capture("collection");
        await page
          .locator(".gift-tile")
          .filter({ hasText: "Plush Pepe" })
          .click();
        const detail = page.getByRole("dialog", {
          name: "Plush Pepe",
          exact: true,
        });
        await expect(detail.locator(".gift-artwork.is-playing")).toBeVisible();
        const dialogBox = await detail.boundingBox();
        expect(
          dialogBox!.x >= 0 && dialogBox!.x + dialogBox!.width <= width,
        ).toBe(true);
        expect(
          dialogBox!.y >= 0 && dialogBox!.y + dialogBox!.height <= 900,
        ).toBe(true);
        await page.screenshot({ path: `${directory}/gift.png` });
        await detail
          .getByRole("button", { name: "Закрепить в профиле", exact: true })
          .focus();
        await page.keyboard.press("Tab");
        await expect(
          detail.getByRole("button", { name: "Закрыть", exact: true }),
        ).toBeFocused();
        if (width === 768) {
          await page.emulateMedia({ reducedMotion: "reduce" });
          await expect(detail.locator(".gift-artwork")).not.toHaveClass(
            /is-playing/,
          );
          await expect(detail.locator(".gift-animation svg")).toHaveCount(0);
          await expect(detail.locator(".gift-artwork>img")).toHaveCSS(
            "opacity",
            "1",
          );
          await page.screenshot({
            path: `${directory}/gift-reduced-motion.png`,
          });
          await page.emulateMedia({ reducedMotion: "no-preference" });
        }
        await page.keyboard.press("Escape");
        await expect(detail).toBeHidden();
      }
    }
    if (width <= 760) {
      await navigate(page, "Профиль");
      await page.locator(".profile-admin-link").click();
    } else await navigate(page, "Админ-панель");
    await expect(
      page.getByRole("heading", { name: "Админ-панель", exact: true }),
    ).toBeVisible();
    await capture("admin");
  }
  expect(errors).toEqual([]);
  await writeFile(
    evidence + "/responsive-results.json",
    JSON.stringify(
      { widths: [375, 768, 1280, 1920], measurements, pageErrors: errors },
      null,
      2,
    ),
  );
});

test("keyboard skip link and text contrast are usable on the main application surfaces", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await redesignFixture(page);
  await page.goto("/?tab=market");
  await expect(
    page.getByRole("heading", { name: "Маркет", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "К содержимому", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("link", { name: "К содержимому", exact: true }),
  ).toBeInViewport();
  await mkdir(evidence, { recursive: true });
  const ratios = await page
    .locator(".market-item-meta")
    .first()
    .evaluate((element) => {
      const rgb = (value: string) =>
        value
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
      const luminance = (values: number[]) =>
        values
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4;
          })
          .reduce(
            (sum, value, index) =>
              sum + value * [0.2126, 0.7152, 0.0722][index],
            0,
          );
      const background = luminance(
        rgb(getComputedStyle(element.closest(".market-item")!).backgroundColor),
      );
      return [...element.querySelectorAll("strong,.market-price")].map(
        (node) => {
          const text = luminance(rgb(getComputedStyle(node).color));
          return (
            (Math.max(text, background) + 0.05) /
            (Math.min(text, background) + 0.05)
          );
        },
      );
    });
  expect(ratios.every((ratio) => ratio >= 4.5)).toBe(true);
  await writeFile(
    evidence + "/contrast-results.json",
    JSON.stringify(
      { surface: "market product name and price", ratios, threshold: 4.5 },
      null,
      2,
    ),
  );
});

test("login and registration remain readable at every release width", async ({
  page,
}) => {
  await redesignFixture(page);
  await page.route("**/api/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Войдите в аккаунт" }),
    }),
  );
  await page.goto("/");
  for (const width of [375, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("button", { name: "Войти", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir(`${evidence}/after/${width}`, { recursive: true });
    await page.screenshot({ path: `${evidence}/after/${width}/login.png` });
    await page
      .getByRole("button", { name: "Создать аккаунт", exact: true })
      .click();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `${evidence}/after/${width}/register.png` });
    await page
      .getByRole("button", { name: "Вернуться ко входу", exact: true })
      .click();
  }
});
