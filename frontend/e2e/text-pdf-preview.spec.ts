import { expect, test, type Page } from "@playwright/test";

const STAGE_SELECTOR = "[data-text-pdf-preview-stage]";
const CANVAS_SELECTOR = "[data-text-pdf-preview-canvas]";
const LOADER_SELECTOR = "[data-text-pdf-preview-loader]";
const PAGE_SLOT_SELECTOR = "[data-text-pdf-page-slot]";
const PAGE_VIEWPORT_SELECTOR = "[data-text-pdf-page-viewport]";
const PAGE_SELECTOR = "[data-text-pdf-page]";
const PREVIEW_PANEL_SELECTOR = "[data-text-pdf-preview-panel]";
const PREVIEW_RAIL_SELECTOR = "[data-text-pdf-preview-rail]";
const EXPORT_PANEL_SELECTOR = "[data-text-pdf-export-panel]";

const LONG_PREVIEW_TEXT = Array.from({ length: 4 }, (_, pageIndex) => {
  const lines = Array.from(
    { length: 18 },
    (_, lineIndex) =>
      `${lineIndex + 1}. Page ${pageIndex + 1} preview stability line ${lineIndex + 1} with enough text to wrap cleanly.`,
  );
  return [`# Preview page ${pageIndex + 1}`, ...lines].join("\n");
}).join("\n\n---page---\n\n");

test.describe("Text to PDF preview layout", () => {
  test("server-renders a loader instead of unmeasured PDF paper on first paint", async ({ baseURL, browser }) => {
    const appUrl = baseURL ?? "http://localhost:3000";
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 1440, height: 760 },
    });
    const page = await context.newPage();

    try {
      await page.goto(`${appUrl}/files/text-to-pdf`);

      const stage = page.locator(STAGE_SELECTOR);
      const loader = page.locator(LOADER_SELECTOR);

      await expect(stage).toHaveAttribute("data-text-pdf-preview-ready", "false");
      await expect(loader).toBeVisible();
      await expect(page.locator(PAGE_SELECTOR)).toHaveCount(0);

      const canvasBox = await page.locator(CANVAS_SELECTOR).boundingBox();
      const loaderBox = await loader.boundingBox();
      expect(canvasBox).not.toBeNull();
      expect(loaderBox).not.toBeNull();
      expect(canvasBox!.width).toBeGreaterThan(500);
      expect(loaderBox!.width).toBeGreaterThan(canvasBox!.width * 0.75);
      expect(loaderBox!.height).toBeGreaterThan(300);
    } finally {
      await context.close();
    }
  });

  test("keeps desktop scale stable and grows the pinned preview rail during outer-page scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 760 });
    await openTextPdfPreview(page);

    const before = await readPreviewMetrics(page);
    expect(before.pageWillChange).toBe("transform");
    expect(["content", "layout paint style", "layout style paint"]).toContain(before.stage.contain);
    expect(before.stage.overflowX).toBe("hidden");
    expect(before.stage.scrollbarWidth).toBe("none");
    expect(before.stage.webkitScrollbarDisplay).toBe("none");
    expect(["content", "layout paint style", "layout style paint"]).toContain(before.canvas.contain);

    await scrollPreviewTo(page, 320);
    const afterPreviewScroll = await readPreviewMetrics(page);

    expect(afterPreviewScroll.scale).toBe(before.scale);
    expect(afterPreviewScroll.transform).toBe(before.transform);
    expect(afterPreviewScroll.stage.scrollWidth).toBeLessThanOrEqual(afterPreviewScroll.stage.clientWidth + 1);
    expect(afterPreviewScroll.canvas.scrollWidth).toBeLessThanOrEqual(afterPreviewScroll.canvas.clientWidth + 1);

    const beforeOuterScrollRail = await readPreviewRailMetrics(page);
    expect(beforeOuterScrollRail.bottom).toBeLessThanOrEqual(beforeOuterScrollRail.viewportBottom + 1);
    expect(beforeOuterScrollRail.cardGap).toBeLessThanOrEqual(1);
    expect(beforeOuterScrollRail.exportPanelBottom).toBeLessThanOrEqual(beforeOuterScrollRail.viewportBottom + 1);
    expect(beforeOuterScrollRail.generateButtonBottom).toBeLessThanOrEqual(beforeOuterScrollRail.viewportBottom + 1);

    await page.evaluate(() => window.scrollTo(0, 720));
    await page.waitForFunction(() => window.scrollY >= 640);
    const afterOuterScroll = await readPreviewMetrics(page);
    const afterOuterScrollRail = await readPreviewRailMetrics(page);

    expect(afterOuterScroll.scale).toBe(before.scale);
    expect(afterOuterScroll.transform).toBe(before.transform);
    expect(afterOuterScroll.stage.scrollTop).toBe(afterPreviewScroll.stage.scrollTop);
    expect(afterOuterScrollRail.position).toBe("sticky");
    expect(afterOuterScrollRail.top).toBeLessThan(beforeOuterScrollRail.top);
    expect(afterOuterScrollRail.height).toBeGreaterThan(beforeOuterScrollRail.height + 20);
    expect(afterOuterScrollRail.left).toBe(beforeOuterScrollRail.left);
    expect(Math.abs(afterOuterScrollRail.top - afterOuterScrollRail.stickyTop)).toBeLessThanOrEqual(2);
    expect(afterOuterScrollRail.bottom).toBeLessThanOrEqual(afterOuterScrollRail.viewportBottom + 1);
    expect(afterOuterScrollRail.cardGap).toBeLessThanOrEqual(1);
    expect(afterOuterScrollRail.exportPanelBottom).toBeLessThanOrEqual(afterOuterScrollRail.viewportBottom + 1);
    expect(afterOuterScrollRail.generateButtonBottom).toBeLessThanOrEqual(afterOuterScrollRail.viewportBottom + 1);
  });

  test("keeps a single-page preview scrollable while the container bottom stays visible", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTextPdfPreview(page, {
      fillText: false,
      minimumPageCount: 1,
    });

    await expect(page.getByLabel("Document title")).toHaveValue("");
    await expect(page.getByLabel("Document title")).toHaveAttribute("placeholder", "Untitled document");
    await expect(page.getByLabel("Text to convert into PDF")).toHaveValue("");
    await expect(page.getByLabel("Text to convert into PDF")).toHaveAttribute("placeholder", "Type something...");
    await expect(page.getByText("0 / 50,000 chars")).toBeVisible();

    const before = await readPreviewMetrics(page);
    const beforeBoxes = await readPreviewBoxes(page);
    const rail = await readPreviewRailMetrics(page);

    expect(before.stage.scrollbarWidth).toBe("none");
    expect(before.stage.webkitScrollbarDisplay).toBe("none");
    expect(before.stage.scrollHeight).toBeGreaterThan(before.stage.clientHeight + 8);
    expect(beforeBoxes.stage.bottom).toBeLessThanOrEqual(beforeBoxes.viewport.bottom + 1);
    expect(beforeBoxes.page.bottom).toBeGreaterThan(beforeBoxes.stage.bottom);
    expect(rail.cardGap).toBeLessThanOrEqual(1);
    expect(rail.exportPanelBottom).toBeLessThanOrEqual(rail.viewportBottom + 1);
    expect(rail.generateButtonBottom).toBeLessThanOrEqual(rail.viewportBottom + 1);
    expect(before.stage.scrollWidth).toBeLessThanOrEqual(before.stage.clientWidth + 1);
    expect(before.canvas.scrollWidth).toBeLessThanOrEqual(before.canvas.clientWidth + 1);

    await scrollPreviewToBottom(page);
    const after = await readPreviewMetrics(page);
    const afterBoxes = await readPreviewBoxes(page);

    expect(after.scale).toBe(before.scale);
    expect(after.transform).toBe(before.transform);
    expect(after.stage.scrollTop).toBeGreaterThan(0);
    expect(afterBoxes.page.bottom).toBeLessThanOrEqual(afterBoxes.stage.bottom - 12);
    expect(afterBoxes.stage.bottom).toBeLessThanOrEqual(afterBoxes.viewport.bottom + 1);
  });

  test("preserves the logical preview anchor across desktop resize", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 760 });
    await openTextPdfPreview(page);

    const anchor = await setPreviewAnchor(page, 1, 0.42);
    const before = await readPreviewMetrics(page);

    await page.setViewportSize({ width: 1100, height: 760 });
    await page.waitForFunction(
      ({ selector, previousWidth }) => {
        const viewport = document.querySelector<HTMLElement>(selector);
        if (!viewport) return false;
        const nextWidth = Number.parseFloat(
          getComputedStyle(viewport).getPropertyValue("--preview-render-width"),
        );
        return Math.abs(nextWidth - previousWidth) > 1;
      },
      { selector: PAGE_VIEWPORT_SELECTOR, previousWidth: before.renderWidth },
    );

    const after = await readPreviewMetrics(page);
    const expectedScrollTop =
      anchor.pageIndex * (after.renderHeight + after.pageGap) +
      anchor.pageProgress * after.renderHeight;

    expect(after.scale).not.toBe(before.scale);
    expect(Math.abs(after.stage.scrollTop - expectedScrollTop)).toBeLessThanOrEqual(2);
    expect(after.stage.scrollWidth).toBeLessThanOrEqual(after.stage.clientWidth + 1);
  });

  test("uses the same native PDF constants and avoids horizontal overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await openTextPdfPreview(page, { mobile: true });

    const before = await readPreviewMetrics(page);
    await scrollPreviewTo(page, 240);
    const afterPreviewScroll = await readPreviewMetrics(page);

    expect(before.nativePageWidth).toBe("595px");
    expect(afterPreviewScroll.nativePageWidth).toBe(before.nativePageWidth);
    expect(afterPreviewScroll.scale).toBe(before.scale);
    expect(afterPreviewScroll.transform).toBe(before.transform);
    expect(afterPreviewScroll.stage.scrollWidth).toBeLessThanOrEqual(afterPreviewScroll.stage.clientWidth + 1);
    expect(afterPreviewScroll.canvas.scrollWidth).toBeLessThanOrEqual(afterPreviewScroll.canvas.clientWidth + 1);
  });
});

async function openTextPdfPreview(
  page: Page,
  options: {
    fillText?: false | string;
    minimumPageCount?: number;
    mobile?: boolean;
    requirePreviewScroll?: boolean;
  } = {},
) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "cookieConsent",
      JSON.stringify({
        preferences: {
          necessary: true,
          analytics: false,
          marketing: false,
          preferences: false,
        },
        timestamp: Date.now(),
        version: "1.0.0",
      }),
    );
  });
  await page.goto("/files/text-to-pdf");
  if (options.fillText !== false) {
    await page.getByLabel("Text to convert into PDF").fill(options.fillText ?? LONG_PREVIEW_TEXT);
  }

  if (options.mobile) {
    await page.evaluate(() => {
      const previewTab = Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "preview",
      );
      if (!(previewTab instanceof HTMLButtonElement)) {
        throw new Error("Preview tab was not available.");
      }
      previewTab.click();
    });
  }

  await expect(page.locator(STAGE_SELECTOR)).toBeVisible();
  const minimumPageCount = options.minimumPageCount ?? 4;
  const requirePreviewScroll = options.requirePreviewScroll ?? true;
  await page.waitForFunction(
    ({ loaderSelector, minimumPageCount, pageSlotSelector, requirePreviewScroll, stageSelector, viewportSelector }) => {
      const stage = document.querySelector<HTMLElement>(stageSelector);
      const viewport = document.querySelector<HTMLElement>(viewportSelector);
      const pageSlots = document.querySelectorAll(pageSlotSelector);
      const loader = document.querySelector(loaderSelector);
      if (!stage || !viewport) return false;
      const scale = Number.parseFloat(getComputedStyle(viewport).getPropertyValue("--preview-page-scale"));
      return (
        stage.dataset.textPdfPreviewReady === "true" &&
        !loader &&
        Number.isFinite(scale) &&
        scale > 0 &&
        pageSlots.length >= minimumPageCount &&
        (requirePreviewScroll ? stage.scrollHeight > stage.clientHeight : stage.scrollHeight <= stage.clientHeight + 2)
      );
    },
    {
      loaderSelector: LOADER_SELECTOR,
      minimumPageCount,
      pageSlotSelector: PAGE_SLOT_SELECTOR,
      requirePreviewScroll,
      stageSelector: STAGE_SELECTOR,
      viewportSelector: PAGE_VIEWPORT_SELECTOR,
    },
  );
}

async function scrollPreviewTo(page: Page, scrollTop: number) {
  await page.locator(STAGE_SELECTOR).evaluate((stage, nextScrollTop) => {
    stage.scrollTop = nextScrollTop;
  }, scrollTop);

  await page.waitForFunction(
    ({ selector, expectedScrollTop }) => {
      const stage = document.querySelector<HTMLElement>(selector);
      return Boolean(stage && Math.abs(stage.scrollTop - expectedScrollTop) <= 1);
    },
    { selector: STAGE_SELECTOR, expectedScrollTop: scrollTop },
  );
}

async function scrollPreviewToBottom(page: Page) {
  const expectedScrollTop = await page.locator(STAGE_SELECTOR).evaluate((stage) => {
    stage.scrollTop = stage.scrollHeight - stage.clientHeight;
    return stage.scrollTop;
  });

  await page.waitForFunction(
    ({ selector, expectedScrollTop }) => {
      const stage = document.querySelector<HTMLElement>(selector);
      return Boolean(stage && Math.abs(stage.scrollTop - expectedScrollTop) <= 1);
    },
    { selector: STAGE_SELECTOR, expectedScrollTop },
  );
}

async function setPreviewAnchor(page: Page, pageIndex: number, pageProgress: number) {
  return page.locator(STAGE_SELECTOR).evaluate(
    (stage, anchor) => {
      const canvas = document.querySelector<HTMLElement>("[data-text-pdf-preview-canvas]");
      const viewport = document.querySelector<HTMLElement>("[data-text-pdf-page-viewport]");
      if (!canvas || !viewport) {
        throw new Error("Preview elements were not available.");
      }

      const pageGap = Number.parseFloat(getComputedStyle(canvas).rowGap || "0");
      const renderHeight = Number.parseFloat(
        getComputedStyle(viewport).getPropertyValue("--preview-render-height"),
      );
      const scrollTop =
        anchor.pageIndex * (renderHeight + pageGap) + anchor.pageProgress * renderHeight;
      stage.scrollTop = scrollTop;

      return { ...anchor, pageGap, renderHeight, scrollTop };
    },
    { pageIndex, pageProgress },
  );
}

async function readPreviewMetrics(page: Page) {
  return page.evaluate(
    ({ stageSelector, canvasSelector, viewportSelector, pageSelector }) => {
      const stage = document.querySelector<HTMLElement>(stageSelector);
      const canvas = document.querySelector<HTMLElement>(canvasSelector);
      const viewport = document.querySelector<HTMLElement>(viewportSelector);
      const pageElement = document.querySelector<HTMLElement>(pageSelector);
      if (!stage || !canvas || !viewport || !pageElement) {
        throw new Error("Preview elements were not available.");
      }

      const viewportStyle = getComputedStyle(viewport);
      const canvasStyle = getComputedStyle(canvas);
      const pageStyle = getComputedStyle(pageElement);
      const webkitScrollbarStyle = getComputedStyle(stage, "::-webkit-scrollbar");

      return {
        scale: viewportStyle.getPropertyValue("--preview-page-scale").trim(),
        nativePageWidth: viewportStyle.getPropertyValue("--preview-page-width").trim(),
        renderWidth: Number.parseFloat(viewportStyle.getPropertyValue("--preview-render-width")),
        renderHeight: Number.parseFloat(viewportStyle.getPropertyValue("--preview-render-height")),
        transform: pageStyle.transform,
        pageWillChange: pageStyle.willChange,
        pageGap: Number.parseFloat(canvasStyle.rowGap || "0"),
        stage: {
          clientWidth: stage.clientWidth,
          scrollWidth: stage.scrollWidth,
          clientHeight: stage.clientHeight,
          scrollHeight: stage.scrollHeight,
          scrollTop: stage.scrollTop,
          contain: getComputedStyle(stage).contain,
          overflowX: getComputedStyle(stage).overflowX,
          scrollbarWidth: getComputedStyle(stage).scrollbarWidth,
          webkitScrollbarDisplay: webkitScrollbarStyle.display,
          webkitScrollbarHeight: webkitScrollbarStyle.height,
          webkitScrollbarWidth: webkitScrollbarStyle.width,
        },
        canvas: {
          clientWidth: canvas.clientWidth,
          scrollWidth: canvas.scrollWidth,
          contain: canvasStyle.contain,
        },
      };
    },
    {
      canvasSelector: CANVAS_SELECTOR,
      pageSelector: PAGE_SELECTOR,
      stageSelector: STAGE_SELECTOR,
      viewportSelector: PAGE_VIEWPORT_SELECTOR,
    },
  );
}

async function readPreviewBoxes(page: Page) {
  return page.evaluate(
    ({ pageSelector, stageSelector }) => {
      const stage = document.querySelector<HTMLElement>(stageSelector);
      const pageElement = document.querySelector<HTMLElement>(pageSelector);
      if (!stage || !pageElement) {
        throw new Error("Preview elements were not available.");
      }

      const stageRect = stage.getBoundingClientRect();
      const pageRect = pageElement.getBoundingClientRect();

      return {
        page: {
          bottom: pageRect.bottom,
          top: pageRect.top,
        },
        stage: {
          bottom: stageRect.bottom,
          top: stageRect.top,
        },
        viewport: {
          bottom: window.innerHeight,
          top: 0,
        },
      };
    },
    { pageSelector: PAGE_SELECTOR, stageSelector: STAGE_SELECTOR },
  );
}

async function readPreviewRailMetrics(page: Page) {
  return page.evaluate(({ exportPanelSelector, previewPanelSelector, railSelector }) => {
    const rail = document.querySelector<HTMLElement>(railSelector);
    const previewPanel = document.querySelector<HTMLElement>(previewPanelSelector);
    const exportPanel = document.querySelector<HTMLElement>(exportPanelSelector);
    const generateButton = exportPanel?.querySelector<HTMLElement>("button");
    if (!rail) {
      throw new Error("Preview rail was not available.");
    }
    if (!previewPanel) {
      throw new Error("Preview panel was not available.");
    }
    if (!exportPanel || !generateButton) {
      throw new Error("Export panel was not available.");
    }

    const railRect = rail.getBoundingClientRect();
    const railStyle = getComputedStyle(rail);
    const previewPanelRect = previewPanel.getBoundingClientRect();
    const exportPanelRect = exportPanel.getBoundingClientRect();
    const generateButtonRect = generateButton.getBoundingClientRect();

    return {
      bottom: railRect.bottom,
      cardGap: Math.max(0, exportPanelRect.top - previewPanelRect.bottom),
      exportPanelBottom: exportPanelRect.bottom,
      generateButtonBottom: generateButtonRect.bottom,
      height: railRect.height,
      left: railRect.left,
      position: railStyle.position,
      stickyTop: Number.parseFloat(railStyle.top || "0"),
      top: railRect.top,
      viewportBottom: window.innerHeight,
    };
  }, {
    exportPanelSelector: EXPORT_PANEL_SELECTOR,
    previewPanelSelector: PREVIEW_PANEL_SELECTOR,
    railSelector: PREVIEW_RAIL_SELECTOR,
  });
}
