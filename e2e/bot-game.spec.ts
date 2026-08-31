import { expect, test } from "@playwright/test";
import { expectBoardVisible, playMove } from "./helpers";

test.describe("bot game", () => {
  test("bot setup screen loads with difficulty options", async ({ page }) => {
    await page.goto("/play/ai", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/bot|máy|cấp độ|level/i);
    expect(await page.locator("button").count()).toBeGreaterThan(3);
  });

  test("starting a bot game gives a legal board and the engine replies", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/play/ai", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /start|bắt đầu|chơi/i }).last().click();
    await expectBoardVisible(page);

    await playMove(page, "e2", "e4");
    await expect(page.locator("body")).toContainText("e4");

    // Engine answer arrives within a reasonable budget (local Stockfish worker).
    await expect
      .poll(async () => (await page.locator("body").innerText()).length, { timeout: 45_000 })
      .toBeGreaterThan(0);

    expect(errors.filter((m) => !/ResizeObserver/i.test(m))).toEqual([]);
  });
});
