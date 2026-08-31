import { expect, test } from "@playwright/test";
import { clickSquare, expectBoardVisible, goto, playMove } from "./helpers";

async function startLocalGame(page: import("@playwright/test").Page) {
  await goto(page, "/play/local");
  await page.getByRole("button", { name: /^(bắt đầu|start game|start)$/i }).click();
  await expectBoardVisible(page);
}

test.describe("standard chess — local board", () => {
  test("starts a game, plays legal moves and castles kingside", async ({ page }) => {
    await startLocalGame(page);

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
    // Castling recorded in SAN proves the rook moved together with the king.
    await expect(body).toContainText(/O-O/);
  });

  test("rejects an illegal move instead of faking a position", async ({ page }) => {
    await startLocalGame(page);

    // e2 -> e5 is illegal for a pawn on its first move.
    await playMove(page, "e2", "e5");
    await clickSquare(page, "a1");
    await expect(page.locator("body")).toContainText(/chưa có nước đi|no moves yet/i);
  });
});
