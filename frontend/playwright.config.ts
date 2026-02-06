import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright Configuration for Flowauxi E2E Tests
 *
 * Run all tests: npx playwright test
 * Run specific test: npx playwright test console-signup
 * Run in UI mode: npx playwright test --ui
 */
export default defineConfig({
  testDir: "./e2e",

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Parallel workers
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: "html",

  // Shared settings for all projects
  use: {
    // Base URL for the frontend
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",

    // Collect trace when retrying the failed test
    trace: "on-first-retry",

    // Screenshot on failure
    screenshot: "only-on-failure",
  },

  // Configure projects for major browsers
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Run your local dev server before starting the tests
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120 * 1000,
      },
});
