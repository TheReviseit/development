import { expect, test, type Page, type Route } from "@playwright/test";

const DROPZONE = "[data-ocr-upload-dropzone]";
const RESULT_PANEL = "[data-ocr-result-panel]";
const BOTTOM_UPLOAD = "[data-ocr-bottom-upload]";
const COPY_BUTTON = "[data-ocr-copy]";
const DOWNLOAD_BUTTON = "[data-ocr-download]";

test.describe("OCR upload tool", () => {
  test("renders public OCR pages instead of the coming-soon placeholder", async ({ page }) => {
    for (const path of ["/tools/ocr", "/files/ocr"]) {
      await openOcr(page, path);
      await expect(page.getByRole("heading", { name: "Image to Text OCR" })).toBeVisible();
      await expect(page.locator(DROPZONE)).toBeVisible();
      await expect(page.getByText("Coming soon")).toHaveCount(0);
    }
  });

  test("does not create horizontal overflow on desktop or mobile", async ({ page }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 760 },
    ]) {
      await page.setViewportSize(viewport);
      await openOcr(page);

      const metrics = await page.evaluate(() => ({
        bodyWidth: document.body.scrollWidth,
        documentWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));

      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
      expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    }
  });

  test("uploads an image, shows full extracted text, and enables result actions", async ({ page }) => {
    await mockCompletedOcr(page);
    await openOcr(page);

    await expect(page.locator(COPY_BUTTON)).toHaveCount(0);
    await expect(page.locator(DOWNLOAD_BUTTON)).toHaveCount(0);

    await uploadImage(page);

    const result = page.locator(RESULT_PANEL);
    await expect(result).toContainText("Invoice #12345");
    await expect(result).toContainText("Total paid: 1,240 INR");
    await expect(result).toContainText("Thank you for choosing Flowauxi.");
    await expect(page.locator(COPY_BUTTON)).toBeEnabled();
    await expect(page.locator(DOWNLOAD_BUTTON)).toBeEnabled();
  });

  test("keeps actions disabled while extraction is still pending", async ({ page }) => {
    await mockPendingOcr(page);
    await openOcr(page);
    await uploadImage(page);

    await expect(page.locator(RESULT_PANEL)).toContainText("Reading the image");
    await expect(page.locator(COPY_BUTTON)).toBeDisabled();
    await expect(page.locator(DOWNLOAD_BUTTON)).toBeDisabled();
  });

  test("rejects unsupported files without calling the upload API", async ({ page }) => {
    let uploadCalled = false;
    await page.route("**/api/file-tools/ocr/upload", async (route) => {
      uploadCalled = true;
      await route.fulfill({ status: 500, body: "Unexpected upload" });
    });
    await openOcr(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: "scan.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7"),
    });

    await expect(page.getByText("PDF and HEIC OCR are not available yet.")).toBeVisible();
    expect(uploadCalled).toBe(false);
  });

  test("keeps the sticky bottom upload dock clear of result text on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await mockCompletedOcr(page);
    await openOcr(page);
    await uploadImage(page);

    await expect(page.locator(BOTTOM_UPLOAD)).toBeVisible();
    await page.locator(BOTTOM_UPLOAD).scrollIntoViewIfNeeded();

    const metrics = await page.evaluate(
      ({ bottomUpload, resultPanel }) => {
        const dock = document.querySelector<HTMLElement>(bottomUpload);
        const result = document.querySelector<HTMLElement>(resultPanel);
        const text = result?.querySelector<HTMLElement>("pre, [class*='layoutPreview']");
        const dockRect = dock?.getBoundingClientRect();
        const textRect = text?.getBoundingClientRect();

        return {
          documentWidth: document.documentElement.scrollWidth,
          dockTop: dockRect?.top ?? 0,
          innerWidth: window.innerWidth,
          textBottom: textRect?.bottom ?? 0,
        };
      },
      { bottomUpload: BOTTOM_UPLOAD, resultPanel: RESULT_PANEL },
    );

    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.textBottom).toBeLessThanOrEqual(metrics.dockTop + 1);
  });
});

async function openOcr(page: Page, path = "/tools/ocr") {
  await seedCookieConsent(page);
  await page.goto(path);
  await expect(page.locator(DROPZONE).first()).toBeVisible();
}

async function uploadImage(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d,
    ]),
  });
}

async function mockCompletedOcr(page: Page) {
  await page.route("**/api/file-tools/ocr/**", (route) => handleOcrRoute(route, "completed"));
}

async function mockPendingOcr(page: Page) {
  await page.route("**/api/file-tools/ocr/**", (route) => handleOcrRoute(route, "queued"));
}

async function handleOcrRoute(route: Route, status: "completed" | "queued") {
  const url = new URL(route.request().url());
  const pathname = url.pathname;
  const completedJob = {
    id: "ocr-job-1",
    status,
    fileName: "receipt.png",
    mimeType: "image/png",
    pageCount: 1,
    processedPageCount: status === "completed" ? 1 : 0,
    confidence: status === "completed"
      ? { mean: 0.96, min: 0.9, lowConfidenceTokenCount: 0, providerAgreement: 1 }
      : null,
    failure: null,
  };

  if (pathname.endsWith("/ocr/upload")) {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ job: completedJob, taskId: "task-ocr-job-1" }),
    });
    return;
  }

  if (pathname.endsWith("/text")) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "ocr-job-1",
        status,
        text: status === "completed" ? extractedText : "",
      }),
    });
    return;
  }

  if (pathname.endsWith("/json")) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...completedJob,
        text: status === "completed" ? extractedText : "",
        blocks: status === "completed" ? extractedBlocks : [],
      }),
    });
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(completedJob),
  });
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

const extractedText = [
  "Invoice #12345",
  "Total paid: 1,240 INR",
  "Thank you for choosing Flowauxi.",
].join("\n");

const extractedBlocks = [
  {
    id: "line-1",
    pageIndex: 0,
    type: "line",
    text: "Invoice #12345",
    bbox: { x: 12, y: 24, width: 220, height: 28 },
    confidence: 0.97,
    readingOrder: 1,
  },
  {
    id: "line-2",
    pageIndex: 0,
    type: "line",
    text: "Total paid: 1,240 INR",
    bbox: { x: 12, y: 68, width: 260, height: 28 },
    confidence: 0.96,
    readingOrder: 2,
  },
  {
    id: "line-3",
    pageIndex: 0,
    type: "line",
    text: "Thank you for choosing Flowauxi.",
    bbox: { x: 12, y: 112, width: 320, height: 28 },
    confidence: 0.95,
    readingOrder: 3,
  },
];
