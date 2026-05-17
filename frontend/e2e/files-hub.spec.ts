import { expect, test, type Page } from "@playwright/test";

const CATEGORY_RAIL = "[data-files-category-rail]";
const CATEGORY_PILL = "[data-files-category-pill]";
const CATEGORY_PILL_TEXT = "[data-files-category-pill-text]";
const TOOL_CARD = "[data-files-tool-card]";
const TOOL_CARD_DESCRIPTION = "[data-files-tool-card-description]";
const TOOL_CARD_ICON = "[data-files-tool-card-icon]";
const TOOL_CARD_TITLE = "[data-files-tool-card-title]";

const PRIMARY_LOCALES = ["en", "ta", "hi", "ml", "kn", "te"] as const;
const VIEWPORT_WIDTHS = [1440, 1180, 1024, 430, 390, 360, 320, 280] as const;
const EXPECTED_GRID_COLUMNS: Record<(typeof VIEWPORT_WIDTHS)[number], number> = {
  1440: 4,
  1180: 3,
  1024: 3,
  430: 1,
  390: 1,
  360: 1,
  320: 1,
  280: 1,
};

test.describe("Files tool hub", () => {
  test("preserves full category labels while rendering compact rail labels", async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 760 });
    await openFilesHub(page, "/en/files");

    const organizePill = page.locator(CATEGORY_PILL).nth(2);
    await expect(organizePill.locator(CATEGORY_PILL_TEXT)).toHaveText("Organize");
    await expect(organizePill).toHaveAttribute("title", "Organize PDF");
    await expect(organizePill).toHaveAttribute("aria-label", "Organize PDF");
  });

  test("keeps category chips in one horizontally scrollable mobile row", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await openFilesHub(page);

    const rail = page.locator(CATEGORY_RAIL);
    await expect(rail).toBeVisible();

    const metrics = await rail.evaluate((element, pillSelector) => {
      const railElement = element as HTMLElement;
      const pills = Array.from(railElement.querySelectorAll<HTMLElement>(pillSelector));
      const rects = pills.map((pill) => pill.getBoundingClientRect());
      const firstTop = rects[0]?.top ?? 0;
      const maxPillHeight = Math.max(...rects.map((rect) => rect.height));

      railElement.scrollLeft = railElement.scrollWidth;

      return {
        clientWidth: railElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        maxPillHeight,
        maxTopDelta: Math.max(...rects.map((rect) => Math.abs(rect.top - firstTop))),
        railHeight: railElement.getBoundingClientRect().height,
        scrollLeft: railElement.scrollLeft,
        scrollWidth: railElement.scrollWidth,
      };
    }, CATEGORY_PILL);

    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
    expect(metrics.scrollLeft).toBeGreaterThan(0);
    expect(metrics.maxTopDelta).toBeLessThanOrEqual(1);
    expect(metrics.railHeight).toBeLessThanOrEqual(metrics.maxPillHeight + 6);
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  });

  test("uses the compact mobile card composition", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 760 });
    await openFilesHub(page, "/ml/files");

    const metrics = await page.locator(TOOL_CARD).first().evaluate(
      (card, selectors) => {
        const icon = card.querySelector<HTMLElement>(selectors.icon);
        const title = card.querySelector<HTMLElement>(selectors.title);
        const description = card.querySelector<HTMLElement>(selectors.description);

        if (!icon || !title || !description) {
          throw new Error("Mobile card targets are missing");
        }

        const cardRect = card.getBoundingClientRect();
        const iconRect = icon.getBoundingClientRect();
        const titleRect = title.getBoundingClientRect();
        const descriptionRect = description.getBoundingClientRect();

        return {
          cardRight: cardRect.right,
          descriptionBelowHeader: descriptionRect.top >= Math.max(iconRect.bottom, titleRect.bottom) + 8,
          descriptionInsideCard: descriptionRect.right <= cardRect.right + 1,
          iconLeftOfTitle: iconRect.right <= titleRect.left,
          titleInsideCard: titleRect.right <= cardRect.right + 1,
          viewportWidth: window.innerWidth,
        };
      },
      { description: TOOL_CARD_DESCRIPTION, icon: TOOL_CARD_ICON, title: TOOL_CARD_TITLE },
    );

    expect(metrics.cardRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.iconLeftOfTitle).toBe(true);
    expect(metrics.titleInsideCard).toBe(true);
    expect(metrics.descriptionBelowHeader).toBe(true);
    expect(metrics.descriptionInsideCard).toBe(true);
  });

  test("refreshes client translations during soft locale navigation on tool pages", async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 900 });
    await openFilesTool(page, "/en/files/text-to-pdf");

    await expect(page.locator("[data-files-product-content]")).toContainText("Text to PDF");

    await page.locator('button[aria-haspopup="menu"][aria-label]').first().click();
    await page.locator('a[href="/ml/files/text-to-pdf"]').first().click();
    await expect(page).toHaveURL(/\/ml\/files\/text-to-pdf$/);

    const content = page.locator("[data-files-product-content]");
    await expect(content).toContainText("ടെക്സ്റ്റിൽ നിന്ന് PDF");
    await expect(content).not.toContainText("Guest exports are private");
  });

  test("keeps multilingual layouts width-stable across primary locales", async ({ page }) => {
    test.slow();

    for (const locale of PRIMARY_LOCALES) {
      for (const width of VIEWPORT_WIDTHS) {
        await page.setViewportSize({ width, height: 960 });
        await openFilesHub(page, `/${locale}/files`);

        const metrics = await measureLayoutStability(page);

        expect.soft(metrics.documentWidth, `${locale}/${width} document width`).toBeLessThanOrEqual(width + 1);
        expect.soft(metrics.bodyWidth, `${locale}/${width} body width`).toBeLessThanOrEqual(width + 1);
        expect.soft(metrics.firstPillVisibleInViewport, `${locale}/${width} first pill viewport visibility`).toBe(true);
        expect.soft(metrics.firstPillVisibleInRail, `${locale}/${width} first pill rail visibility`).toBe(true);
        expect.soft(metrics.gridColumns, `${locale}/${width} grid columns`).toBe(EXPECTED_GRID_COLUMNS[width]);
        expect.soft(metrics.headerDoesNotOverlapRail, `${locale}/${width} header/rail overlap`).toBe(true);
        expect.soft(metrics.overflowingPillLabels, `${locale}/${width} compact category labels`).toEqual([]);
        if (width <= 390) {
          expect.soft(metrics.visiblePillsAtStart, `${locale}/${width} visible category pills`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  test("keeps the category rail safe in future RTL mode", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await openFilesHub(page, "/ml/files");

    await page.evaluate(() => {
      document.documentElement.setAttribute("dir", "rtl");
      document.querySelector("main")?.setAttribute("dir", "rtl");
    });

    const metrics = await measureLayoutStability(page);
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.firstPillVisibleInRail).toBe(true);
  });
});

async function openFilesHub(page: Page, path = "/files") {
  await seedCookieConsent(page);
  await page.goto(path);
  await expect(page.locator(CATEGORY_RAIL)).toBeVisible();
}

async function openFilesTool(page: Page, path: string) {
  await seedCookieConsent(page);
  await page.goto(path);
  await expect(page.locator("[data-files-product-content]")).toBeVisible();
}

async function seedCookieConsent(page: Page) {
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
}

async function measureLayoutStability(page: Page) {
  return page.evaluate(
    ({ categoryPill, categoryPillText, categoryRail }) => {
      const rail = document.querySelector<HTMLElement>(categoryRail);
      const firstPill = document.querySelector<HTMLElement>(categoryPill);
      const grid = document.querySelector<HTMLElement>('[class*="files-hub-module"][class*="grid"]');
      const header = document.querySelector<HTMLElement>('[class*="files-hub-module"][class*="header"]');

      if (!rail || !firstPill || !grid || !header) {
        throw new Error("Files hub layout targets are missing");
      }

      const railRect = rail.getBoundingClientRect();
      const firstPillRect = firstPill.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const gridColumns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
      const visiblePillsAtStart = Array.from(rail.querySelectorAll<HTMLElement>(categoryPill)).filter((pill) => {
        const rect = pill.getBoundingClientRect();
        return rect.left >= railRect.left - 1 && rect.right <= railRect.right + 1;
      }).length;
      const overflowingPillLabels = Array.from(rail.querySelectorAll<HTMLElement>(categoryPillText))
        .filter((text) => text.scrollWidth > text.clientWidth + 1)
        .map((text) => text.textContent?.trim() ?? "");

      return {
        bodyWidth: document.body.scrollWidth,
        documentWidth: document.documentElement.scrollWidth,
        firstPillVisibleInRail: firstPillRect.right > railRect.left && firstPillRect.left < railRect.right,
        firstPillVisibleInViewport: firstPillRect.right > 0 && firstPillRect.left < window.innerWidth,
        gridColumns,
        headerDoesNotOverlapRail: headerRect.bottom <= railRect.top,
        innerWidth: window.innerWidth,
        overflowingPillLabels,
        railClientWidth: rail.clientWidth,
        railScrollWidth: rail.scrollWidth,
        visiblePillsAtStart,
      };
    },
    { categoryPill: CATEGORY_PILL, categoryPillText: CATEGORY_PILL_TEXT, categoryRail: CATEGORY_RAIL },
  );
}
