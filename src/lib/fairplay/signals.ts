import type { MoveObservation, TurnTelemetry } from "./types";

/** A focus loss shorter than this is normal (notifications, taps). */
export const BLUR_THRESHOLD_MS = 1500;

export interface BehaviourSignals {
  timeCv: number;
  blurTurns: number;
  hardFastShare: number;
  blurShare: number;
  blurMatchLift: number;
  noHesitationShare: number;
  pasteCount: number;
  duplicateTabCount: number;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Fuse behavioural telemetry with the engine observations for the same plies.
 *
 * `blurMatchLift` is the strongest single behavioural signal: honest players do
 * not get measurably better right after leaving the tab, assisted players do.
 */
export function behaviourSignals(
  turns: TurnTelemetry[],
  observations: MoveObservation[],
): BehaviourSignals {
  if (turns.length === 0) {
    return {
      timeCv: 1,
      blurTurns: 0,
      hardFastShare: 0,
      blurShare: 0,
      blurMatchLift: 0,
      noHesitationShare: 0,
      pasteCount: 0,
      duplicateTabCount: 0,
    };
  }

  const byPly = new Map(observations.map((o) => [o.ply, o]));
  const times = turns.map((t) => t.spentMs).filter((t) => t > 0);
  const m = mean(times);
  const medianTime = median(times);

  const hardTurns = turns.filter((t) => (byPly.get(t.ply)?.complexity ?? 0) >= 0.55);
  const hardFast = hardTurns.filter((t) => t.spentMs > 0 && t.spentMs < medianTime);

  const blurred = turns.filter((t) => t.blurMs >= BLUR_THRESHOLD_MS);
  const focused = turns.filter((t) => t.blurMs < BLUR_THRESHOLD_MS);
  const matchRate = (list: TurnTelemetry[]) => {
    const withObs = list.filter((t) => byPly.has(t.ply));
    if (withObs.length === 0) return null;
    return withObs.filter((t) => byPly.get(t.ply)!.isTop1).length / withObs.length;
  };
  const blurRate = matchRate(blurred);
  const focusRate = matchRate(focused);

  return {
    timeCv: m === 0 ? 1 : round(sd(times) / m),
    blurTurns: blurred.length,
    hardFastShare: hardTurns.length === 0 ? 0 : round(hardFast.length / hardTurns.length),
    blurShare: round(blurred.length / turns.length),
    // Shrink toward zero by sample size: 3 blurred turns cannot carry a verdict.
    blurMatchLift:
      blurRate === null || focusRate === null || blurred.length < 4
        ? 0
        : round((blurRate - focusRate) * (blurred.length / (blurred.length + 8))),
    noHesitationShare: round(
      turns.filter((t) => t.directToTarget && t.exploredSquares === 0).length / turns.length,
    ),
    pasteCount: turns.filter((t) => t.pasted).length,
    duplicateTabCount: turns.filter((t) => t.duplicateTab).length,
  };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export { mean as meanOf, sd as sdOf };
