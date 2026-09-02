import { describe, expect, it } from "vitest";
import { AI_ROSTER, AI_ROSTER_SIZE, RANKED_AI_STYLES, aiRosterByKey } from "./aiRoster";

describe("AI roster", () => {
  it("has exactly 100 entries", () => {
    expect(AI_ROSTER).toHaveLength(AI_ROSTER_SIZE);
  });

  it("has 100 unique keys", () => {
    expect(new Set(AI_ROSTER.map((e) => e.key)).size).toBe(AI_ROSTER_SIZE);
  });

  it("has 100 unique display names", () => {
    expect(new Set(AI_ROSTER.map((e) => e.name)).size).toBe(AI_ROSTER_SIZE);
  });

  it("uses the canonical key format", () => {
    for (const entry of AI_ROSTER) expect(entry.key).toMatch(/^nine64_ai_\d{3}$/);
  });

  it("keeps every target rating inside the engine-representable band", () => {
    for (const entry of AI_ROSTER) {
      expect(entry.targetRating).toBeGreaterThanOrEqual(700);
      expect(entry.targetRating).toBeLessThanOrEqual(3190);
    }
  });

  it("uses only known personalities", () => {
    for (const entry of AI_ROSTER) expect(RANKED_AI_STYLES).toContain(entry.personality);
  });

  it("spreads strength across the whole ladder, not one band", () => {
    const below1200 = AI_ROSTER.filter((e) => e.targetRating < 1200).length;
    const above2400 = AI_ROSTER.filter((e) => e.targetRating >= 2400).length;
    expect(below1200).toBeGreaterThanOrEqual(15);
    expect(above2400).toBeGreaterThanOrEqual(10);
    expect(AI_ROSTER.some((e) => e.targetRating >= 3000)).toBe(true);
  });

  it("has unique avatar seeds and resolves by key", () => {
    expect(new Set(AI_ROSTER.map((e) => e.avatarSeed)).size).toBe(AI_ROSTER_SIZE);
    expect(aiRosterByKey("nine64_ai_001")?.name).toBe(AI_ROSTER[0]!.name);
    expect(aiRosterByKey("missing")).toBeUndefined();
  });
});
