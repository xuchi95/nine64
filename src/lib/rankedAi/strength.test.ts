import { describe, expect, it } from "vitest";
import {
  UCI_ELO_FLOOR,
  clampRating,
  engineLevelForRating,
  maxSearchMsFor,
  rankedAiConfigForRating,
  subEloBandFor,
} from "./strength.server";
import { humanThinkDelayMs, sleepAfterSearchMs } from "./thinkTime";
import { AI_ROSTER } from "@/config/aiRoster";

const rapid = { pace: "realtime" as const, baseMs: 600_000, incMs: 0, variant: "standard" as const };

describe("ranked AI strength mapping", () => {
  it("clamps ratings into the representable band", () => {
    expect(clampRating(10)).toBe(700);
    expect(clampRating(99_999)).toBe(3190);
    expect(clampRating(Number.NaN)).toBe(1200);
  });

  it("uses native UCI_Elo at or above the Stockfish floor", () => {
    const cfg = rankedAiConfigForRating({ ...rapid, rating: 1800 });
    expect(cfg.limitStrength).toBe(true);
    expect(cfg.uciElo).toBe(1800);
    expect(cfg.skill).toBe(20);
  });

  it("uses skill + hard search caps below the floor", () => {
    const cfg = rankedAiConfigForRating({ ...rapid, rating: 800 });
    expect(cfg.limitStrength).toBe(false);
    expect(cfg.uciElo).toBeNull();
    expect(cfg.skill).toBe(subEloBandFor(800).skill);
    expect(cfg.depth).not.toBeNull();
    expect(cfg.nodes).not.toBeNull();
  });

  it("is monotonic: higher rating never searches weaker", () => {
    let prevSkill = -1;
    for (let r = 700; r < UCI_ELO_FLOOR; r += 50) {
      const skill = rankedAiConfigForRating({ ...rapid, rating: r }).skill ?? 0;
      expect(skill).toBeGreaterThanOrEqual(prevSkill);
      prevSkill = skill;
    }
  });

  it("stays cheap so many AI games can run at once", () => {
    for (const entry of AI_ROSTER) {
      const cfg = rankedAiConfigForRating({ ...rapid, rating: entry.targetRating });
      expect(cfg.threads).toBe(1);
      expect(cfg.multiPv).toBe(1);
      expect(cfg.hashMb).toBeLessThanOrEqual(256);
      expect(cfg.ponder).toBe(false);
      expect(cfg.maxMoveTimeMs).toBeLessThanOrEqual(8_000);
    }
  });

  it("shrinks the search budget for fast time controls", () => {
    const bullet = maxSearchMsFor({ pace: "realtime", baseMs: 60_000, incMs: 0 });
    const classical = maxSearchMsFor({ pace: "realtime", baseMs: 1_800_000, incMs: 10_000 });
    expect(bullet).toBeLessThan(classical);
    expect(bullet).toBeGreaterThanOrEqual(250);
  });

  it("maps ratings onto sane bot tiers", () => {
    expect(engineLevelForRating(700)).toBe(1);
    expect(engineLevelForRating(3190)).toBe(15);
    expect(engineLevelForRating(1500)).toBeGreaterThan(engineLevelForRating(900));
  });
});

describe("human-like think time", () => {
  const base = { gameId: "g-1", ply: 20, rating: 1500, remainingMs: 300_000, searchMs: 0, pace: "realtime" as const };

  it("is deterministic for the same move", () => {
    expect(humanThinkDelayMs(base)).toBe(humanThinkDelayMs(base));
  });

  it("varies between moves", () => {
    const values = new Set([10, 11, 12, 13, 14].map((ply) => humanThinkDelayMs({ ...base, ply })));
    expect(values.size).toBeGreaterThan(1);
  });

  it("never risks flagging the AI on low clock", () => {
    expect(humanThinkDelayMs({ ...base, remainingMs: 800 })).toBe(0);
    const low = humanThinkDelayMs({ ...base, remainingMs: 5_000 });
    expect(low).toBeLessThanOrEqual(4_500);
  });

  it("subtracts the search time already spent", () => {
    const total = humanThinkDelayMs(base);
    expect(sleepAfterSearchMs({ ...base, searchMs: total + 5_000 })).toBe(0);
    expect(sleepAfterSearchMs({ ...base, searchMs: 0 })).toBe(total);
  });

  it("opens faster than it thinks in the middlegame", () => {
    const opening = humanThinkDelayMs({ ...base, ply: 4 });
    const middle = humanThinkDelayMs({ ...base, ply: 30 });
    expect(opening).toBeLessThan(middle);
  });
});
