import { expect, test } from "@playwright/test";
import { expectBoardVisible, goto, playMove } from "./helpers";

test.describe("bot game", () => {
  test("bot setup screen loads with difficulty options", async ({ page }) => {
    await goto(page, "/play/ai");
    await expect(page.locator("body")).toContainText(/bot|máy|cấp độ|level/i);
    expect(await page.locator("button").count()).toBeGreaterThan(3);
  });

  test("starting a bot game gives a legal board and the engine replies", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await goto(page, "/play/ai");
    await page.getByRole("button", { name: /^(bắt đầu|start game|start)$/i }).click();
    await expectBoardVisible(page);

    await playMove(page, "e2", "e4");
    await expect(page.locator("body")).toContainText("e4");

    // The local Stockfish worker must answer with a legal black reply.
    await expect
      .poll(
        async () => {
          const text = await page.locator("body").innerText();
          return /\b1\s+e4\s+[A-Za-z0-9+#=-]+/.test(text.replace(/[\n\t]+/g, " "));
        },
        { timeout: 60_000 },
      )
      .toBe(true);

    expect(errors.filter((m) => !/ResizeObserver/i.test(m))).toEqual([]);
  });
});
