import { test } from "@playwright/test";
import { goto, playMove, expectBoardVisible } from "./helpers";
test("bot", async ({ page }) => {
  page.on("pageerror", e => console.log("PAGEERROR", e.message.slice(0,200)));
  page.on("console", m => { if (m.type()==="error") console.log("CERR", m.text().slice(0,200)); });
  await goto(page, "/play/ai");
  await page.getByRole("button", { name: /^(bắt đầu|start game|start)$/i }).click();
  await expectBoardVisible(page);
  await playMove(page, "e2", "e4");
  await page.waitForTimeout(15000);
  console.log("TEXT", (await page.locator("body").innerText()).replace(/\n/g," | ").slice(0, 1200));
});
