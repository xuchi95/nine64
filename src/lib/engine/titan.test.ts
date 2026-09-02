import { describe, expect, it } from "vitest";
import { BOT_LEVELS, getBotLevel } from "@/config/bots";
import {
  TITAN_FALLBACK_CONFIG,
  TITAN_LEVEL,
  engineConfigSchema,
  isFullStrength,
  parseEngineConfig,
} from "@/lib/engine/profileTypes";
import { interpretHealthPayload } from "@/lib/engine/cloudEngine.server";

describe("browser bot levels stay intact", () => {
  it("keeps levels 1..15 running in the browser", () => {
    for (let level = 1; level <= 15; level += 1) {
      const bot = getBotLevel(level);
      expect(bot.level).toBe(level);
      expect(bot.runtime ?? "browser").toBe("browser");
    }
  });

  it("adds exactly one cloud tier", () => {
    const cloud = BOT_LEVELS.filter((b) => b.runtime === "cloud");
    expect(cloud).toHaveLength(1);
    expect(cloud[0]!.level).toBe(TITAN_LEVEL);
    expect(cloud[0]!.title).toBe("Nine64 Titan");
  });

  it("never advertises a fake Elo for Titan", () => {
    const titan = getBotLevel(TITAN_LEVEL);
    expect(titan.uciElo).toBeNull();
    expect(titan.strength).not.toMatch(/\d{3,4}/);
  });
});

describe("titan engine config", () => {
  it("is full strength with no humanisation", () => {
    expect(isFullStrength(TITAN_FALLBACK_CONFIG)).toBe(true);
    expect(TITAN_FALLBACK_CONFIG.limitStrength).toBe(false);
    expect(TITAN_FALLBACK_CONFIG.uciElo).toBeNull();
    expect(TITAN_FALLBACK_CONFIG.skill).toBe(20);
    expect(TITAN_FALLBACK_CONFIG.multiPv).toBe(1);
    expect(TITAN_FALLBACK_CONFIG.openingRandomness).toBe(0);
    expect(TITAN_FALLBACK_CONFIG.personalityTolerance).toBe(0);
  });

  it("rejects out-of-range values instead of clamping silently", () => {
    expect(engineConfigSchema.safeParse({ ...TITAN_FALLBACK_CONFIG, threads: 999 }).success).toBe(false);
    expect(engineConfigSchema.safeParse({ ...TITAN_FALLBACK_CONFIG, hashMb: 1 }).success).toBe(false);
    expect(engineConfigSchema.safeParse({ ...TITAN_FALLBACK_CONFIG, multiPv: 99 }).success).toBe(false);
  });

  it("falls back to a safe config for unusable stored values", () => {
    const parsed = parseEngineConfig({ threads: "not-a-number" });
    expect(parsed.threads).toBeGreaterThan(0);
    expect(parsed.multiPv).toBeGreaterThanOrEqual(1);
  });

  it("does not claim Syzygy pieces beyond the configured probe limit by default", () => {
    expect(TITAN_FALLBACK_CONFIG.syzygyEnabled).toBe(false);
    expect(TITAN_FALLBACK_CONFIG.syzygyPieces).toBe(0);
  });
});

describe("cloud engine health contract", () => {
  it("reports healthy for a free pool", () => {
    const h = interpretHealthPayload(
      { status: "ok", engineVersion: "Stockfish 18", arch: "x64", pool: { size: 2, busy: 0 }, stats: {} },
      12,
    );
    expect(h.status).toBe("healthy");
    expect(h.pool).toEqual({ size: 2, busy: 0 });
    expect(h.engineVersion).toBe("Stockfish 18");
  });

  it("reports degraded when every engine process is busy", () => {
    const h = interpretHealthPayload({ status: "ok", pool: { size: 1, busy: 1 } }, 12);
    expect(h.status).toBe("degraded");
  });

  it("never reports healthy for a malformed payload", () => {
    expect(interpretHealthPayload({ status: "ok", pool: 3 }, 5).status).toBe("unavailable");
    expect(interpretHealthPayload(null, 5).status).toBe("unavailable");
    // A warming service is never "healthy": it reports its own starting state.
    expect(interpretHealthPayload({ status: "starting", pool: { size: 1, busy: 0 } }, 5).status).toBe("starting");
  });

  it("does not echo credentials in the health detail", () => {
    const h = interpretHealthPayload({ status: "ok", pool: { size: 1, busy: 0 } }, 5);
    expect(JSON.stringify(h)).not.toMatch(/PLAY_ENGINE|PRIVATE KEY|Bearer/i);
  });
});

describe("titan cost controls are honest", () => {
  it("keeps an enforceable per-user daily move quota", () => {
    expect(TITAN_FALLBACK_CONFIG.perUserDailyMoves).toBeGreaterThan(0);
    expect(TITAN_FALLBACK_CONFIG.maxConcurrentGames).toBeGreaterThan(0);
  });

  it("does not ship a non-enforced USD cap as a real control", () => {
    expect(TITAN_FALLBACK_CONFIG.maxCostPerDayUsd).toBe(0);
  });
});
