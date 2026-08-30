import { describe, expect, it } from "vitest";
import {
  CLOCK_LAG_GRACE_MS,
  applyClockTransition,
  deriveDisplayClock,
  type ClockBase,
} from "./clock";

const base = (over: Partial<ClockBase> = {}): ClockBase => ({
  whiteTimeMs: 300_000,
  blackTimeMs: 300_000,
  activeSide: "w",
  elapsedAtSyncMs: 0,
  running: true,
  ...over,
});

describe("deriveDisplayClock", () => {
  it("only counts down the side to move", () => {
    const out = deriveDisplayClock(base(), 5_000);
    expect(out.w).toBe(295_000);
    expect(out.b).toBe(300_000);
  });

  it("includes elapsed time the server already reported", () => {
    const out = deriveDisplayClock(base({ elapsedAtSyncMs: 2_000 }), 1_000);
    expect(out.w).toBe(297_000);
  });

  it("never goes negative and reports expiry", () => {
    const out = deriveDisplayClock(base({ whiteTimeMs: 500 }), 4_000);
    expect(out.w).toBe(0);
    expect(out.expired).toBe(true);
  });

  it("freezes when the canonical clock is stopped (finished game)", () => {
    const out = deriveDisplayClock(base({ running: false }), 60_000);
    expect(out).toEqual({ w: 300_000, b: 300_000, expired: false });
  });

  it("a background tab that resumes shows the server-derived value, not drift", () => {
    // sinceSyncMs comes from a monotonic clock: a 10 min freeze then resume
    // still yields base - elapsed, identical to a continuously visible tab.
    const b = base({ whiteTimeMs: 600_000 });
    expect(deriveDisplayClock(b, 600_000).w).toBe(0);
    expect(deriveDisplayClock(b, 120_000).w).toBe(480_000);
  });
});

describe("applyClockTransition (mirror of commit_move_internal)", () => {
  it("deducts from the mover only and credits the increment once", () => {
    const out = applyClockTransition({
      whiteTimeMs: 180_000,
      blackTimeMs: 180_000,
      moverIsWhite: true,
      elapsedMs: 5_000 + CLOCK_LAG_GRACE_MS,
      incrementMs: 2_000,
    });
    expect(out.whiteTimeMs).toBe(177_000);
    expect(out.blackTimeMs).toBe(180_000);
    expect(out.flagged).toBe(false);
  });

  it("applies the fixed latency grace and never a client value", () => {
    const out = applyClockTransition({
      whiteTimeMs: 10_000,
      blackTimeMs: 10_000,
      moverIsWhite: false,
      elapsedMs: 100,
      incrementMs: 0,
    });
    // elapsed clamps to 0 because 100ms < grace
    expect(out.blackTimeMs).toBe(10_000);
  });

  it("flags without crediting an increment when time ran out", () => {
    const out = applyClockTransition({
      whiteTimeMs: 1_000,
      blackTimeMs: 30_000,
      moverIsWhite: true,
      elapsedMs: 9_000,
      incrementMs: 10_000,
    });
    expect(out.flagged).toBe(true);
    expect(out.whiteTimeMs).toBe(0);
    expect(out.blackTimeMs).toBe(30_000);
  });

  it("two sequential commits credit the increment exactly twice, never four times", () => {
    const first = applyClockTransition({
      whiteTimeMs: 60_000,
      blackTimeMs: 60_000,
      moverIsWhite: true,
      elapsedMs: 1_000 + CLOCK_LAG_GRACE_MS,
      incrementMs: 2_000,
    });
    const second = applyClockTransition({
      whiteTimeMs: first.whiteTimeMs,
      blackTimeMs: first.blackTimeMs,
      moverIsWhite: false,
      elapsedMs: 1_000 + CLOCK_LAG_GRACE_MS,
      incrementMs: 2_000,
    });
    expect(second.whiteTimeMs).toBe(61_000);
    expect(second.blackTimeMs).toBe(61_000);
  });

  it("clocks can never go negative", () => {
    const out = applyClockTransition({
      whiteTimeMs: 10,
      blackTimeMs: 10,
      moverIsWhite: true,
      elapsedMs: 999_999,
      incrementMs: 5_000,
    });
    expect(out.whiteTimeMs).toBeGreaterThanOrEqual(0);
    expect(out.blackTimeMs).toBeGreaterThanOrEqual(0);
  });
});
