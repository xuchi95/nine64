import { test } from "@playwright/test";
test("ctx", async ({ page }) => {
  await page.goto("/play", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const t = (await page.locator("body").innerText()).toLowerCase();
  let i = t.indexOf("960");
  while (i >= 0) { console.log("CTX", JSON.stringify(t.slice(Math.max(0,i-60), i+40))); i = t.indexOf("960", i+1); }
});
