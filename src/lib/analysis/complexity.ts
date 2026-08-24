import { cpToWinPercent } from "./winrate";

export interface ComplexityInput {
  /** Win percents (mover POV) of the top engine lines, best first. */
  candidateWinPercents: number[];
  legalMoves: number;
}

/**
 * Position complexity in [0,1].
 * Positions where several moves are near-equal and many moves are legal are
 * "hard"; positions with one forced continuation are "easy" and therefore
 * contribute little to accuracy.
 */
export function positionComplexity({
  candidateWinPercents,
  legalMoves,
}: ComplexityInput): number {
  if (candidateWinPercents.length === 0) return 0.5;
  const best = candidateWinPercents[0]!;
  const others = candidateWinPercents.slice(1);
  // Spread: small gap between best and alternatives = many playable moves.
  const gaps = others.map((wp) => Math.max(0, best - wp));
  const meanGap = gaps.length === 0 ? 40 : gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const choiceFactor = Math.exp(-meanGap / 12); // 1 = all equal, →0 = only move
  const breadth = Math.min(1, Math.log(Math.max(2, legalMoves)) / Math.log(45));
  const raw = 0.65 * choiceFactor + 0.35 * breadth;
  return Math.round(Math.max(0.05, Math.min(1, raw)) * 1000) / 1000;
}

/** Only-move positions should not be rewarded — weight scales with complexity. */
export function accuracyWeight(complexity: number): number {
  return Math.round(Math.max(0.15, complexity) * 1000) / 1000;
}

export function cpListToWinPercents(cps: (number | null)[], mover: "w" | "b"): number[] {
  return cps
    .filter((c): c is number => c !== null)
    .map((cp) => (mover === "w" ? cpToWinPercent(cp) : 100 - cpToWinPercent(cp)));
}
