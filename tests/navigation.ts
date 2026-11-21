import type { Page } from "@playwright/test";
export async function openNavigation(page: Page) {
  if ((page.viewportSize()?.width || 0) <= 760) return;
  const panel = page.locator(".workspace-dialog:visible");
  if (await panel.count()) {
    await panel.getByRole("button", { name: "Закрыть", exact: true }).click();
    await panel.waitFor({ state: "hidden" });
  }
  await page.locator(".app-topbar").waitFor({ state: "visible" });
}
export async function navigate(page: Page, label: string) {
  if ((page.viewportSize()?.width || 0) <= 760) {
    if (label === "Кошелёк") {
      await page
        .locator(".mobile-nav")
        .getByRole("button", { name: "Маркет", exact: true })
        .click();
      await page
        .getByRole("link", { name: "Открыть кошелёк", exact: true })
        .click();
    } else
      await page
        .locator(".mobile-nav")
        .getByRole("button", {
          name: label === "Мой профиль" ? "Профиль" : label,
          exact: true,
        })
        .click();
  } else {
    await openNavigation(page);
    await page
      .locator(".app-topbar")
      .getByRole("button", { name: label, exact: true })
      .click();
  }
}
