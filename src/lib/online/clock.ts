/**
 * Online clock helpers.
 *
 * The database is the only authority for remaining time. These helpers exist
 * for two purposes:
 *  - `deriveDisplayClock` extrapolates a countdown for the UI between syncs;
 *  - `applyClockTransition` is a *reference mirror* of the SQL executed inside
 *    `public.commit_move_internal`, kept in sync so the rules (deduct from the
 *    mover only, credit the increment exactly once, flag at zero) are unit
 *    testable. It is never used to write clocks anywhere.
 */

/** Fixed, server-owned latency grace — mirrors `public.clock_lag_grace_ms()`. */
export const CLOCK_LAG_GRACE_MS = 150;

export interface ClockBase {
  /** Remaining ms for White at the start of the active turn. */
  whiteTimeMs: number;
  /** Remaining ms for Black at the start of the active turn. */
  blackTimeMs: number;
  activeSide: "w" | "b";
  /** Ms of the active turn the server says already elapsed at sync time. */
  elapsedAtSyncMs: number;
  /** Whether the canonical clock is running (game active). */
  running: boolean;
}

/** Countdown shown in the UI. `sinceSyncMs` must come from a monotonic timer. */
export function deriveDisplayClock(
  base: ClockBase,
  sinceSyncMs: number,
): { w: number; b: number; expired: boolean } {
  if (!base.running) {
    return { w: base.whiteTimeMs, b: base.blackTimeMs, expired: false };
  }
  const elapsed = base.elapsedAtSyncMs + Math.max(0, sinceSyncMs);
  const activeBase = base.activeSide === "w" ? base.whiteTimeMs : base.blackTimeMs;
  const remaining = Math.max(0, activeBase - elapsed);
  return {
    w: base.activeSide === "w" ? remaining : base.whiteTimeMs,
    b: base.activeSide === "b" ? remaining : base.blackTimeMs,
    expired: remaining <= 0,
  };
}

export interface ClockTransitionInput {
  whiteTimeMs: number;
  blackTimeMs: number;
  moverIsWhite: boolean;
  /** Elapsed ms measured by the database between turn start and commit. */
  elapsedMs: number;
  incrementMs: number;
}

export interface ClockTransitionResult {
  whiteTimeMs: number;
  blackTimeMs: number;
  flagged: boolean;
}

/** Reference mirror of the clock math inside `commit_move_internal`. */
export function applyClockTransition(input: ClockTransitionInput): ClockTransitionResult {
  const elapsed = Math.max(0, input.elapsedMs - CLOCK_LAG_GRACE_MS);
  const moverRemaining =
    (input.moverIsWhite ? input.whiteTimeMs : input.blackTimeMs) - elapsed;

  if (moverRemaining <= 0) {
    return {
      whiteTimeMs: input.moverIsWhite ? 0 : input.whiteTimeMs,
      blackTimeMs: input.moverIsWhite ? input.blackTimeMs : 0,
      flagged: true,
    };
  }

  const next = moverRemaining + input.incrementMs;
  return {
    whiteTimeMs: input.moverIsWhite ? next : input.whiteTimeMs,
    blackTimeMs: input.moverIsWhite ? input.blackTimeMs : next,
    flagged: false,
  };
}
