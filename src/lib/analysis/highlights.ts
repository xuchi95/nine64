/**
 * Game Review 3.0 — highlights layer.
 *
 * Pure, deterministic summary derived from engine facts only. The AI coach may
 * later rephrase these strings, but it can never introduce a move or a claim
 * that is not present here.
 */
import type { PlyAnalysis } from "./types";
import type { GamePhase } from "./phase";

export interface HighlightItem {
  /** i18n key suffix under `review.highlight.*`. */
  kind: string;
  /** Values interpolated into the localized sentence. */
  values: Record<string, string | number>;
  ply?: number;
}

export interface PhaseScore {
  phase: GamePhase;
  accuracy: number;
  moves: number;
}

export interface GameHighlights {
  accuracy: number;
  bestPhase: PhaseScore | null;
  worstPhase: PhaseScore | null;
  /** Up to three things the player did well. */
  strengths: HighlightItem[];
  /** Up to three concrete things to improve. */
  improvements: HighlightItem[];
  /** Single biggest missed opportunity, if any. */
  biggestMiss: { ply: number; san: string; bestUci: string | null; loss: number } | null;
  counts: { brilliant: number; great: number; mistake: number; blunder: number; miss: number };
}

const PHASES: GamePhase[] = ["opening", "middlegame", "endgame"];

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function phaseScores(plies: PlyAnalysis[]): PhaseScore[] {
  return PHASES.map((phase) => {
    const rows = plies.filter((p) => p.phase === phase);
    const accuracy = rows.length
      ? round(rows.reduce((s, p) => s + p.accuracy, 0) / rows.length)
      : 0;
    return { phase, accuracy, moves: rows.length };
  }).filter((p) => p.moves >= 3);
}

/**
 * Build the highlights for one side of a reviewed game.
 * `plies` must already be the full review; filtering by colour happens here so
 * the caller cannot accidentally mix both players' statistics.
 */
export function buildHighlights(allPlies: PlyAnalysis[], color: "w" | "b"): GameHighlights {
  const plies = allPlies.filter((p) => p.color === color);
  const counts = {
    brilliant: plies.filter((p) => p.label === "brilliant").length,
    great: plies.filter((p) => p.label === "great").length,
    mistake: plies.filter((p) => p.label === "mistake").length,
    blunder: plies.filter((p) => p.label === "blunder").length,
    miss: plies.filter((p) => p.label === "miss").length,
  };
  const accuracy = plies.length
    ? round(plies.reduce((s, p) => s + p.accuracy, 0) / plies.length)
    : 0;

  const scores = phaseScores(plies);
  const sorted = [...scores].sort((a, b) => b.accuracy - a.accuracy);
  const bestPhase = sorted[0] ?? null;
  const worstPhase = sorted.length > 1 ? (sorted[sorted.length - 1] ?? null) : null;

  const strengths: HighlightItem[] = [];
  if (counts.brilliant > 0)
    strengths.push({ kind: "brilliant", values: { n: counts.brilliant } });
  if (counts.great > 0) strengths.push({ kind: "great", values: { n: counts.great } });
  if (bestPhase && bestPhase.accuracy >= 80)
    strengths.push({
      kind: "phaseStrong",
      values: { phase: bestPhase.phase, accuracy: bestPhase.accuracy },
    });
  if (accuracy >= 85) strengths.push({ kind: "overall", values: { accuracy } });
  const cleanRun = plies.length > 0 && counts.blunder === 0;
  if (cleanRun) strengths.push({ kind: "noBlunder", values: {} });

  const improvements: HighlightItem[] = [];
  const worstMoves = [...plies]
    .filter((p) => p.label === "blunder" || p.label === "mistake" || p.label === "miss")
    .sort((a, b) => b.loss - a.loss);
  const top = worstMoves[0];
  if (top)
    improvements.push({
      kind: "worstMove",
      values: { move: Math.floor(top.index / 2) + 1, san: top.san, loss: round(top.loss) },
      ply: top.index,
    });
  if (worstPhase && worstPhase.accuracy < 75)
    improvements.push({
      kind: "phaseWeak",
      values: { phase: worstPhase.phase, accuracy: worstPhase.accuracy },
    });
  if (counts.miss > 0) improvements.push({ kind: "missed", values: { n: counts.miss } });
  const hangs = plies.filter((p) => p.see < 0 && p.loss >= 10).length;
  if (hangs > 0) improvements.push({ kind: "hanging", values: { n: hangs } });

  const biggestMiss = top
    ? { ply: top.index, san: top.san, bestUci: top.bestUci, loss: round(top.loss) }
    : null;

  return {
    accuracy,
    bestPhase,
    worstPhase,
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
    biggestMiss,
    counts,
  };
}
