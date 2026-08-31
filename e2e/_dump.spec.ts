import { test } from "@playwright/test";
for (const p of ["/play", "/analysis", "/online", "/account", "/admin", "/skills"]) {
  test(`dump ${p}`, async ({ page }) => {
    await page.goto(p, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(3000);
    const t = (await page.locator("body").innerText()).toLowerCase();
    console.log(p, "URL", page.url(), "HAS960", t.includes("960"), "RANDOM", t.includes("random army"));
    console.log(p, "TEXT", t.slice(0, 300).replace(/\n/g, " | "));
  });
}
