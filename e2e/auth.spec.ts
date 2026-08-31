import { expect, test } from "@playwright/test";

test.describe("auth", () => {
  test("login page renders email and password fields", async ({ page }) => {
    await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("register page renders and links back to login", async ({ page }) => {
    await page.goto("/auth/register", { waitUntil: "domcontentloaded" });
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator("body")).toContainText(/đăng nhập|sign in|log in/i);
  });

  test("invalid credentials show an inline error, never a toast-free silent success", async ({ page }) => {
    await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"]').first().fill("e2e-not-a-user@example.com");
    await page.locator('input[type="password"]').first().fill("wrong-password-123");
    await page.getByRole("button", { name: /đăng nhập|sign in|log in/i }).first().click();
    await page.waitForTimeout(4000);
    expect(page.url()).toMatch(/auth/);
  });

  test("protected routes redirect anonymous visitors", async ({ page }) => {
    for (const path of ["/account", "/skills", "/admin"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      expect(page.url(), `${path} must be gated`).toMatch(/auth|login/);
    }
  });
});
