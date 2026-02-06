import { test, expect } from "@playwright/test";

/**
 * Console Signup Flow E2E Tests
 *
 * These tests verify that PII is never exposed in URLs during the signup flow.
 * This is a security regression test to ensure email addresses don't leak.
 */

test.describe("Console Signup Flow - PII Security", () => {
  test("signup should not expose email in URL during redirect to verification", async ({
    page,
  }) => {
    // Navigate to signup page
    await page.goto("/console/signup");

    // Verify we're on the signup page
    await expect(page.locator("h1")).toContainText("Create your account");

    // Fill in the form with test data
    const testEmail = "test-e2e@example.com";
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="text"][autocomplete="name"]', "E2E Test User");
    await page.fill('input[type="password"]', "SecurePassword123!");

    // Intercept the signup API call to simulate requires_verification: true
    await page.route("**/api/console/auth/signup", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          requires_verification: true,
        }),
      });
    });

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for navigation to complete
    await page.waitForURL("**/console/verify-email**", { timeout: 5000 });

    // CRITICAL SECURITY CHECK: URL must NOT contain email
    const currentUrl = page.url();
    expect(currentUrl).not.toContain("email=");
    expect(currentUrl).not.toContain(encodeURIComponent(testEmail));
    expect(currentUrl).not.toContain(testEmail);
    expect(currentUrl).not.toContain("@");

    // URL should be clean
    expect(currentUrl).toMatch(/\/console\/verify-email\/?$/);

    // Verify email is stored in sessionStorage instead
    const storedEmail = await page.evaluate(() =>
      sessionStorage.getItem("console_verify_email"),
    );
    expect(storedEmail).toBe(testEmail);

    // Verify the page displays the email correctly
    await expect(page.locator("strong")).toContainText(testEmail);
  });

  test("verify-email page should show fallback UI when accessed directly", async ({
    page,
  }) => {
    // Clear sessionStorage first
    await page.goto("/console/verify-email");
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();

    // Wait for page to load
    await expect(page.locator("h1")).toContainText("Verify your email");

    // Should show fallback message
    await expect(page.locator(".console-alert-error")).toContainText(
      "verification session has expired",
    );

    // Should show return to signup button
    const returnButton = page.locator('a[href="/console/signup"]');
    await expect(returnButton).toContainText("Return to Signup");

    // URL should not contain any PII
    const currentUrl = page.url();
    expect(currentUrl).not.toContain("email=");
    expect(currentUrl).not.toContain("@");
  });

  test("URL should never contain email even with valid sessionStorage", async ({
    page,
  }) => {
    // Set up sessionStorage with email
    await page.goto("/console/signup");
    await page.evaluate(() => {
      sessionStorage.setItem("console_verify_email", "stored@example.com");
    });

    // Navigate to verify-email
    await page.goto("/console/verify-email");

    // URL should be clean
    const currentUrl = page.url();
    expect(currentUrl).not.toContain("email=");
    expect(currentUrl).not.toContain("@");

    // But the page should display the email from sessionStorage
    await expect(page.locator("strong")).toContainText("stored@example.com");
  });
});
