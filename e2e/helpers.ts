import { expect, type Page } from "@playwright/test";

/** Click a board square by its accessible name (ChessBoard labels squares "e2", "e4", ...). */
export async function clickSquare(page: Page, square: string) {
  await page.locator(`[aria-label="${square}"]`).first().click();
}

/** Play a from/to move on the interactive board. */
export async function playMove(page: Page, from: string, to: string) {
  await clickSquare(page, from);
  await clickSquare(page, to);
}

export async function expectBoardVisible(page: Page) {
  await expect(page.locator('[aria-label="e1"]').first()).toBeVisible();
}

/** Text of the whole page, lowercased — used for coarse availability assertions. */
export async function pageText(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).toLowerCase();
}

export const SHUFFLE_VARIANT_TERMS = ["chess960", "chess 960", "960", "random army"];
