import { describe, expect, it } from "vitest";
import {
  PROVISIONAL_GAMES,
  PROVISIONAL_RD,
  RATING_TIERS,
  isProvisional,
  nextTier,
  tierForRating,
  tierProgress,
} from "./ratingTiers";

describe("ratingTiers", () => {
  it("ladder is ascending and starts at 0", () => {
    expect(RATING_TIERS[0]!.min).toBe(0);
    for (let i = 1; i < RATING_TIERS.length; i++) {
      expect(RATING_TIERS[i]!.min).toBeGreaterThan(RATING_TIERS[i - 1]!.min);
    }
  });

  it("maps ratings to tiers at exact boundaries", () => {
    expect(tierForRating(0).id).toBe("rookie");
    expect(tierForRating(999).id).toBe("rookie");
    expect(tierForRating(1000).id).toBe("apprentice");
    expect(tierForRating(1199).id).toBe("apprentice");
    expect(tierForRating(1200).id).toBe("club");
    expect(tierForRating(1600).id).toBe("expert");
    expect(tierForRating(2200).id).toBe("legend");
    expect(tierForRating(2900).id).toBe("legend");
  });

  it("computes progress and points to next tier", () => {
    const p = tierProgress(1300);
    expect(p.tier.id).toBe("club");
    expect(p.next?.id).toBe("challenger");
    expect(p.pointsToNext).toBe(100);
    expect(p.progressPct).toBe(50);
  });

  it("caps progress inside the band for out-of-band ratings", () => {
    const p = tierProgress(100000);
    expect(p.tier.id).toBe("legend");
    expect(p.next).toBeNull();
    expect(p.pointsToNext).toBe(0);
    expect(p.progressPct).toBe(100);
  });

  it("nextTier returns null at the top", () => {
    const legend = tierForRating(2300);
    expect(nextTier(legend)).toBeNull();
    const rookie = tierForRating(500);
    expect(nextTier(rookie)?.id).toBe("apprentice");
  });

  it("flags provisional by RD or by few games", () => {
    expect(isProvisional(PROVISIONAL_RD, 50)).toBe(true);
    expect(isProvisional(60, PROVISIONAL_GAMES - 1)).toBe(true);
    expect(isProvisional(60, PROVISIONAL_GAMES)).toBe(false);
  });
});
