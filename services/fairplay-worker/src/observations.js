/**
 * Turn raw engine evaluations of the canonical move ledger into per-move
 * observations for one colour. Pure and deterministic so it can be unit tested
 * without an engine binary.
 *
 * @typedef {{ ply: number, color: "w"|"b", bestCp: number, playedCp: number, isTop1: boolean,
 *             legalMoves: number, spread: number, spentMs: number|null }} PlyEvaluation
 */

/** Win probability of a centipawn score, from the mover's point of view. */
export function winPercent(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamp(cp, -1500, 1500))) - 1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Position complexity 0..1 from engine spread and branching factor. */
export function complexityOf(spread, legalMoves) {
  const spreadPart = clamp(Math.abs(spread) / 150, 0, 1);
  const branchPart = clamp((legalMoves - 8) / 30, 0, 1);
  return Number((0.6 * spreadPart + 0.4 * branchPart).toFixed(4));
}

/**
 * @param {PlyEvaluation[]} plies
 * @param {"w"|"b"} color
 */
export function toObservations(plies, color) {
  return plies
    .filter((p) => p.color === color)
    .map((p) => {
      const loss = clamp(winPercent(p.bestCp) - winPercent(p.playedCp), 0, 100);
      return {
        ply: p.ply,
        isTop1: p.isTop1,
        loss: Number(loss.toFixed(3)),
        complexity: complexityOf(p.spread, p.legalMoves),
        accuracy: Number(clamp(100 - loss * 1.6, 0, 100).toFixed(3)),
        spentMs: p.spentMs,
      };
    });
}

/** Time spent per move derived from the canonical clock deltas in the ledger. */
export function spentMsFor(moves, index, color) {
  const key = color === "w" ? "whiteTimeMs" : "blackTimeMs";
  const own = moves.filter((m) => (m.ply % 2 === 1 ? "w" : "b") === color);
  const current = own[index];
  const previous = own[index - 1];
  if (!current || !previous) return null;
  const delta = previous[key] - current[key];
  return delta > 0 ? delta : null;
}
