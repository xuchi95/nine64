/** Evaluation ↔ win-probability conversions shared by every analysis module. */

export const MATE_CP = 1200;

/** Lichess-calibrated logistic mapping of centipawns to win percentage (0-100). */
export function cpToWinPercent(cp: number): number {
  const clamped = Math.max(-MATE_CP, Math.min(MATE_CP, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

/** Win percent for the side that just moved, given a white-POV centipawn score. */
export function winPercentFor(color: "w" | "b", cp: number): number {
  const wp = cpToWinPercent(cp);
  return color === "w" ? wp : 100 - wp;
}

/** Win-percentage loss of a move (never negative). */
export function winLoss(before: number, after: number): number {
  return Math.max(0, before - after);
}

/**
 * Per-move accuracy from win-percentage loss.
 * Same curve family as Lichess so numbers stay comparable.
 */
export function moveAccuracyFromLoss(loss: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * loss) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/** Harmonic-ish mean that punishes single catastrophic moves more than a plain average. */
export function weightedAccuracy(samples: { accuracy: number; weight: number }[]): number {
  const usable = samples.filter((s) => s.weight > 0);
  if (usable.length === 0) return 0;
  const totalWeight = usable.reduce((a, s) => a + s.weight, 0);
  const mean = usable.reduce((a, s) => a + s.accuracy * s.weight, 0) / totalWeight;
  const worst = Math.min(...usable.map((s) => s.accuracy));
  // 85% weighted mean + 15% worst move keeps blunders visible.
  return Math.round((mean * 0.85 + worst * 0.15) * 10) / 10;
}

/**
 * Estimated performance rating from average centipawn loss.
 * Logistic fit: ACPL 5 → ~2700, ACPL 30 → ~2000, ACPL 100 → ~1000.
 */
export function ratingFromAcpl(acpl: number): number {
  const a = Math.max(1, acpl);
  const est = 3100 - 760 * Math.log(a);
  return Math.max(400, Math.min(2900, Math.round(est / 10) * 10));
}
