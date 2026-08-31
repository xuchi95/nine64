import { expect, test } from "@playwright/test";
import { goto } from "./helpers";

test.describe("auth", () => {
  test("login page renders email and password fields", async ({ page }) => {
    await goto(page, "/auth/login");
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("register page renders and links back to login", async ({ page }) => {
    await goto(page, "/auth/register");
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator("body")).toContainText(/đăng nhập|sign in|log in/i);
  });

  test("invalid credentials keep the user on the auth page", async ({ page }) => {
    await goto(page, "/auth/login");
    await page.locator('input[type="email"]').first().fill("e2e-not-a-user@example.com");
    await page.locator('input[type="password"]').first().fill("wrong-password-123");
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForTimeout(5000);
    expect(page.url()).toMatch(/auth\/login/);
  });

  test("protected routes redirect anonymous visitors", async ({ page }) => {
    for (const path of ["/account", "/skills", "/admin", "/online"]) {
      await goto(page, path);
      expect(page.url(), `${path} must be gated`).toMatch(/auth\/login/);
    }
  });
});
