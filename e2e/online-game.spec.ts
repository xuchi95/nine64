import { expect, test } from "@playwright/test";

test.describe("online play", () => {
  test("online lobby requires authentication", async ({ page }) => {
    await page.goto("/online", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const url = page.url();
    expect(url, "unauthenticated users must not reach the online lobby").toMatch(/auth|login/);
  });

  test("online entry point renders without runtime errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/play", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/online|trực tuyến|bot|máy/i);
    expect(errors.filter((m) => !/ResizeObserver/i.test(m))).toEqual([]);
  });

  test("an unknown online game id does not crash the app", async ({ page }) => {
    await page.goto("/games/online/00000000-0000-0000-0000-000000000000", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);
    await expect(page.locator("body")).not.toContainText(/undefined is not|cannot read properties/i);
  });
});
