import { expect, test, type Page } from "@playwright/test";

const NAVBAR = "[data-files-navbar]";
const MOBILE_DRAWER = "[data-files-mobile-drawer]";
const MOBILE_BACKDROP = "[data-files-mobile-backdrop]";
const MOBILE_SEARCH = "[data-files-mobile-search]";
const MOBILE_SEARCH_INPUT = "[data-files-mobile-search-input]";
const MEGA_MENU = "[data-files-mega-menu]";
const MEGA_INTRO = "[data-files-mega-intro]";
const MEGA_INTRO_BODY = "[data-files-mega-intro-body]";
const PREVIEW_PANEL = "[data-text-pdf-preview-panel]";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 760 },
  { name: "tablet", width: 768, height: 820 },
  { name: "desktop", width: 1024, height: 820 },
  { name: "large desktop", width: 1440, height: 900 },
];

test.describe("Files navbar", () => {
  for (const viewport of VIEWPORTS) {
    test(`does not create horizontal overflow on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openTextToPdf(page);

      const metrics = await page.evaluate((navbarSelector) => {
        const navbar = document.querySelector<HTMLElement>(navbarSelector);
        return {
          bodyWidth: document.body.scrollWidth,
          documentWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          navbarHeight: navbar?.getBoundingClientRect().height ?? 0,
          navbarWidth: navbar?.scrollWidth ?? 0,
        };
      }, NAVBAR);

      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
      expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
      expect(metrics.navbarWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
      expect(metrics.navbarHeight).toBeLessThanOrEqual(viewport.width < 768 ? 66 : 70);

      const menuButton = page.getByRole("button", { name: "Open files navigation" });
      if (viewport.width < 1024) {
        await expect(menuButton).toBeVisible();
      } else {
        await expect(menuButton).toBeHidden();
        await expect(page.getByRole("navigation", { name: "Files tools" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Browse and search files tools" })).toHaveCount(0);
        await expect(page.getByRole("link", { name: "Open all PDF tools" })).toHaveCount(0);
      }
    });
  }

  test("opens an accessible mobile drawer and restores the trigger focus", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await openTextToPdf(page);

    await expect(page.getByRole("button", { name: "Open files navigation" })).toBeVisible();
    const trigger = page.locator('button[aria-controls="files-mobile-navigation"]');
    await trigger.click();

    const drawer = page.locator(MOBILE_DRAWER);
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute("role", "dialog");
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("html")).toHaveCSS("overflow", "hidden");

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(drawer).toBeVisible();
    await page.locator(MOBILE_BACKDROP).click({ position: { x: 8, y: 8 } });
    await expect(drawer).toHaveCount(0);
  });

  test("opens a full-width mobile search panel beside the menu button", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await openTextToPdf(page);

    await expect(page.getByRole("button", { name: "Open files search" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open files navigation" })).toBeVisible();

    const iconButtonStyles = await page.evaluate(() => {
      const searchButton = document.querySelector<HTMLElement>('button[aria-controls="files-mobile-search"]');
      const menuButton = document.querySelector<HTMLElement>('button[aria-controls="files-mobile-navigation"]');
      return {
        menuBorderWidth: menuButton ? getComputedStyle(menuButton).borderTopWidth : "",
        searchBorderWidth: searchButton ? getComputedStyle(searchButton).borderTopWidth : "",
      };
    });
    expect(iconButtonStyles.searchBorderWidth).toBe("0px");
    expect(iconButtonStyles.menuBorderWidth).toBe("0px");

    const trigger = page.locator('button[aria-controls="files-mobile-search"]');
    await trigger.click();

    const panel = page.locator(MOBILE_SEARCH);
    await expect(panel).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(MOBILE_SEARCH_INPUT)).toBeFocused();

    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.x).toBeLessThanOrEqual(1);
    expect(panelBox!.width).toBeGreaterThanOrEqual(389);

    await page.locator(MOBILE_SEARCH_INPUT).fill("word");
    await expect(panel.getByText("Word to PDF")).toBeVisible();

    await page.locator(MOBILE_SEARCH_INPUT).fill("text to pdf");
    await expect(panel.getByText("Text to PDF", { exact: true })).toBeVisible();

    const metrics = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("supports hover and keyboard desktop mega menu interactions", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTextToPdf(page, { requirePreviewVisible: true });

    const trigger = page.getByRole("button", { name: "All tools" });
    await trigger.hover();
    await expect(page.locator(MEGA_MENU)).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(MEGA_INTRO).getByText("Flowauxi Tools", { exact: true })).toBeVisible();

    const megaBox = await page.locator(MEGA_MENU).boundingBox();
    expect(megaBox).not.toBeNull();
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    expect(megaBox!.x).toBeGreaterThanOrEqual(16);
    expect(megaBox!.x + megaBox!.width).toBeLessThanOrEqual(viewportWidth - 16);
    expect(Math.abs(megaBox!.x + megaBox!.width / 2 - viewportWidth / 2)).toBeLessThanOrEqual(2);

    const introMetrics = await page.evaluate(
      ({ bodySelector, introSelector }) => {
        const intro = document.querySelector<HTMLElement>(introSelector);
        const body = document.querySelector<HTMLElement>(bodySelector);
        const introRect = intro?.getBoundingClientRect();
        const bodyRect = body?.getBoundingClientRect();
        return {
          backgroundImage: intro ? getComputedStyle(intro).backgroundImage : "",
          bodyBottomGap: introRect && bodyRect ? introRect.bottom - bodyRect.bottom : -1,
          bodyTopOffset: introRect && bodyRect ? bodyRect.top - introRect.top : -1,
        };
      },
      { bodySelector: MEGA_INTRO_BODY, introSelector: MEGA_INTRO },
    );
    expect(introMetrics.backgroundImage).toContain("menu");
    expect(introMetrics.bodyTopOffset).toBeGreaterThan(220);
    expect(introMetrics.bodyBottomGap).toBeLessThanOrEqual(24);

    await page.getByRole("link", { name: "View all tools" }).hover();
    await expect(page.locator(MEGA_MENU)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(MEGA_MENU)).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.focus();
    await expect(page.locator(MEGA_MENU)).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(page.locator(MEGA_MENU)).toHaveCount(0);
  });

  test("stays pinned without covering the text-to-PDF preview rail", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 820 });
    await openTextToPdf(page);

    const navbar = page.locator(NAVBAR);
    await expect(navbar).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 640));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);

    const metrics = await page.evaluate(
      ({ navbarSelector, previewPanelSelector }) => {
        const navbar = document.querySelector<HTMLElement>(navbarSelector);
        const previewPanel = document.querySelector<HTMLElement>(previewPanelSelector);
        const navbarRect = navbar?.getBoundingClientRect();
        const previewRect = previewPanel?.getBoundingClientRect();

        return {
          navbarBottom: navbarRect?.bottom ?? 0,
          navbarTop: navbarRect?.top ?? -1,
          previewTop: previewRect?.top ?? -1,
        };
      },
      { navbarSelector: NAVBAR, previewPanelSelector: PREVIEW_PANEL },
    );

    expect(Math.abs(metrics.navbarTop)).toBeLessThanOrEqual(1);
    expect(metrics.previewTop).toBeGreaterThanOrEqual(metrics.navbarBottom - 1);
  });
});

async function openTextToPdf(page: Page, options: { requirePreviewVisible?: boolean } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "cookieConsent",
      JSON.stringify({
        preferences: {
          analytics: false,
          marketing: false,
          necessary: true,
        },
        timestamp: Date.now(),
        version: "1.0.0",
      }),
    );
  });

  await page.goto("/files/text-to-pdf");
  await expect(page.locator(NAVBAR)).toBeVisible();
  await expect(page.locator(PREVIEW_PANEL)).toHaveCount(1);
  if (options.requirePreviewVisible) {
    await expect(page.locator(PREVIEW_PANEL)).toBeVisible({ timeout: 15_000 });
  }
}
