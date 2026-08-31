import { expect, test } from "@playwright/test";
import { goto } from "./helpers";

test.describe("online play", () => {
  test("online lobby requires authentication", async ({ page }) => {
    await goto(page, "/online");
    expect(page.url(), "unauthenticated users must not reach the online lobby").toMatch(
      /auth\/login/,
    );
  });

  test("play hub renders online entry without runtime errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await goto(page, "/play");
    await expect(page.locator("body")).toContainText(/trực tuyến|online/i);
    expect(errors.filter((m) => !/ResizeObserver/i.test(m))).toEqual([]);
  });

  test("an unknown online game id does not crash the app", async ({ page }) => {
    await goto(page, "/games/online/00000000-0000-0000-0000-000000000000");
    await expect(page.locator("body")).not.toContainText(/cannot read properties|is not a function/i);
  });
});
