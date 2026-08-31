import { expect, test } from "@playwright/test";
import { pageText, SHUFFLE_VARIANT_TERMS } from "./helpers";

/**
 * Chess960 (and the Random Army variant that shares its shuffled back rank) is
 * intentionally disabled: the current rule engine cannot handle 960 castling,
 * so the platform must never offer it rather than produce illegal castling.
 * These tests are the regression guard for that contract.
 */
const SURFACES = ["/play/local", "/play/ai", "/play", "/analysis"];

test.describe("chess960 castling contract", () => {
  for (const path of SURFACES) {
    test(`no shuffled-back-rank variant is offered on ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      const text = await pageText(page);
      for (const term of SHUFFLE_VARIANT_TERMS) {
        expect(text, `${path} must not offer "${term}"`).not.toContain(term);
      }
    });
  }

  test("capability registry keeps chess960 unplayable and its rule engine unsupported", async ({ page }) => {
    await page.goto("/play/local", { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async () => {
      const variants = await import("/src/config/variants.ts");
      const rules = await import("/src/lib/chess/rules/index.ts");
      const ids = (list: Array<{ id: string }>) => list.map((v) => v.id);
      let castlingError: string | null = null;
      try {
        const adapter = rules.rulesFor("chess960");
        adapter.createGame();
      } catch (err) {
        castlingError = (err as Error).message;
      }
      return {
        local: ids(variants.localVariants()),
        bot: ids(variants.botVariants()),
        online: ids(variants.onlineVariants()),
        supported960: rules.rulesSupported("chess960"),
        supportedRandomArmy: rules.rulesSupported("random-army"),
        supportedStandard: rules.rulesSupported("standard"),
        castlingError,
      };
    });

    expect(result.local).not.toContain("chess960");
    expect(result.local).not.toContain("random-army");
    expect(result.bot).not.toContain("chess960");
    expect(result.online).not.toContain("chess960");
    expect(result.supportedStandard).toBe(true);
    // No silent fallback to standard castling for shuffled positions.
    expect(result.supported960).toBe(false);
    expect(result.supportedRandomArmy).toBe(false);
    expect(result.castlingError ?? "").toMatch(/RULES_ENGINE_UNAVAILABLE|castling/i);
  });
});
