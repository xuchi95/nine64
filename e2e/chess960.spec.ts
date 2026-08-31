import { expect, test } from "@playwright/test";
import { goto, pageText, SHUFFLE_VARIANT_TERMS } from "./helpers";

/**
 * Chess960 (and Random Army, which shares its shuffled back rank) is
 * intentionally disabled: the current rule engine does not implement 960
 * castling, so the platform must never offer the variant rather than produce
 * illegal castling. These tests guard that contract end to end.
 */
const SURFACES = ["/play", "/play/local", "/play/ai", "/analysis"];

test.describe("chess960 castling contract", () => {
  for (const path of SURFACES) {
    test(`no shuffled-back-rank variant is offered on ${path}`, async ({ page }) => {
      await goto(page, path);
      const text = await pageText(page);
      for (const term of SHUFFLE_VARIANT_TERMS) {
        expect(text, `${path} must not offer "${term}"`).not.toContain(term);
      }
    });
  }

  test("capability registry keeps chess960 unplayable and its castling engine unsupported", async ({
    page,
  }) => {
    await goto(page, "/play/local");

    const result = await page.evaluate(async () => {
      const variants = await import("/src/config/variants.ts");
      const rules = await import("/src/lib/chess/rules/index.ts");
      const chess960 = await import("/src/lib/chess/chess960.ts");
      const ids = (list: Array<{ id: string }>) => list.map((v) => v.id);

      let castlingError = "";
      try {
        rules.rulesFor("chess960").createPosition();
      } catch (err) {
        castlingError = `${(err as { code?: string }).code ?? ""} ${(err as Error).message}`;
      }

      // Position generation itself must stay deterministic and legal.
      const start = chess960.generateChess960Position(518);

      return {
        local: ids(variants.localVariants()),
        bot: ids(variants.botVariants()),
        online: ids(variants.onlineVariants()),
        supported960: rules.rulesSupported("chess960"),
        supportedRandomArmy: rules.rulesSupported("random-army"),
        supportedStandard: rules.rulesSupported("standard"),
        arbitraryCastling: rules.rulesFor("chess960").supportsArbitraryCastling,
        castlingError,
        classicalIndexFen: start.fen,
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
    expect(result.arbitraryCastling).toBe(false);
    expect(result.castlingError).toMatch(/RULES_ENGINE_UNAVAILABLE/);
    // Scharnagl index 518 is the classical start position.
    expect(result.classicalIndexFen).toContain("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
  });
});
