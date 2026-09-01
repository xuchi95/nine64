import { describe, it, expect } from "vitest";
import { TITAN_VARIANTS, isTitanVariant, titanSupportsVariant, titanVariantBlockCode } from "./titanVariants";
import { botVariants } from "@/config/variants";

describe("Titan (level 16) variant capability", () => {
  it("supports exactly standard and chess960", () => {
    expect([...TITAN_VARIANTS]).toEqual(["standard", "chess960"]);
  });

  it.each([
    ["standard", true],
    ["chess960", true],
    ["three-check", false],
    ["king-of-the-hill", false],
    ["no-castling", false],
    ["no-queen", false],
  ] as const)("level 16 + %s => supported=%s", (variant, supported) => {
    expect(titanSupportsVariant(variant)).toBe(supported);
    expect(isTitanVariant(variant)).toBe(supported);
    expect(titanVariantBlockCode(variant) === null).toBe(supported);
  });

  it("flags unverified vs. rules-unsupported blocks distinctly", () => {
    expect(titanVariantBlockCode("no-castling")).toBe("ENGINE_UNVERIFIED");
    expect(titanVariantBlockCode("no-queen")).toBe("ENGINE_UNVERIFIED");
    expect(titanVariantBlockCode("three-check")).toBe("ENGINE_RULES_UNSUPPORTED");
    expect(titanVariantBlockCode("king-of-the-hill")).toBe("ENGINE_RULES_UNSUPPORTED");
  });

  it("keeps the full variant offer for levels 1-15", () => {
    const ids = botVariants().map((v) => v.id);
    expect(ids).toEqual(expect.arrayContaining(["standard", "chess960", "three-check", "king-of-the-hill"]));
    // Blocking Titan must not shrink the bot catalogue.
    expect(ids.length).toBeGreaterThan(TITAN_VARIANTS.length);
  });

  it("never coerces an unsupported variant into standard", () => {
    for (const id of ["three-check", "king-of-the-hill", "no-castling", "no-queen"]) {
      expect(isTitanVariant(id)).toBe(false);
    }
  });
});
