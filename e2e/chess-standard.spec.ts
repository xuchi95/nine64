import { expect, test } from "@playwright/test";
import { clickSquare, expectBoardVisible, playMove } from "./helpers";

test.describe("standard chess — local board", () => {
  test("starts a game, plays legal moves and castles kingside", async ({ page }) => {
    await page.goto("/play/local", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: /start|bắt đầu|chơi/i }).last().click();
    await expectBoardVisible(page);

    // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.O-O
    await playMove(page, "e2", "e4");
    await playMove(page, "e7", "e5");
    await playMove(page, "g1", "f3");
    await playMove(page, "b8", "c6");
    await playMove(page, "f1", "c4");
    await playMove(page, "f8", "c5");
    await playMove(page, "e1", "g1");

    const body = page.locator("body");
    await expect(body).toContainText("e4");
    await expect(body).toContainText("Nf3");
    // Castling is recorded in SAN, proving the rook moved with the king.
    await expect(body).toContainText(/O-O/);
  });

  test("rejects an illegal move instead of faking a position", async ({ page }) => {
    await page.goto("/play/local", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /start|bắt đầu|chơi/i }).last().click();
    await expectBoardVisible(page);

    // e2 -> e5 is illegal for a pawn on the first move.
    await playMove(page, "e2", "e5");
    await clickSquare(page, "a1");
    await expect(page.locator("body")).not.toContainText(/\be5\b/);
  });
});
