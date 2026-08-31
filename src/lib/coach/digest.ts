import type { SavedGame } from "@/lib/history";
import { LABEL_META } from "@/lib/analysis/classify";
import { MOTIF_LABEL } from "@/lib/analysis/motifs";

export interface CoachKeyMoment {
  /** Stable canonical id (`ply-<index>`). The model may only reference this. */
  id: string;
  /** 0-based ply index in the game's move list. */
  plyIndex: number;
  moveNumber: number;
  san: string;
  label: string;
  lossPct: number;
  bestMove: string | null;
  evalAfter: string;
  phase: string;
  motifs: string[];
}

export interface CoachDigest {
  side: "w" | "b";
  playerName: string;
  opponentName: string;
  outcome: string;
  variant: string;
  timeControl: string;
  opening: string | null;
  moveCount: number;
  accuracy: { player: number; opponent: number } | null;
  acpl: { player: number; opponent: number } | null;
  estimatedRating: number | null;
  labelCounts: Record<string, number> | null;
  /** Timestamp of the engine review this digest was built from. */
  reviewedAt: string | null;
  /** Compact move list: "12. Nf3 (mistake, -18%, fork missed)". */
  timeline: string[];
  /** Worst decisions for the analysed side, already sorted by damage. */
  keyMoments: CoachKeyMoment[];
  finalFen: string;
}

/** How many key moments the model is allowed to reason about. */
export const DIGEST_KEY_MOMENTS = 6;

function evalText(cp: number | null): string {
  if (cp === null) return "n/a";
  return `${cp > 0 ? "+" : ""}${(cp / 100).toFixed(2)}`;
}

/** Builds a compact, model-friendly summary of one saved game for the AI coach. */
export function buildCoachDigest(game: SavedGame, side: "w" | "b"): CoachDigest {
  const review = game.review;
  const plies = review?.plies ?? [];
  const own = plies.filter((p) => p.color === side);

  const timeline = game.moves.slice(0, 120).map((m, i) => {
    const ply = plies[i];
    const moveNumber = Math.floor(i / 2) + 1;
    const prefix = `${moveNumber}${m.color === "w" ? "." : "..."} ${m.san}`;
    if (!ply) return prefix;
    const bits = [LABEL_META[ply.label].title];
    if (ply.loss >= 1) bits.push(`-${ply.loss.toFixed(1)}%`);
    if (ply.cpAfter !== null) bits.push(`eval ${evalText(ply.cpAfter)}`);
    if (ply.motifs.length) bits.push(ply.motifs.map((mo) => MOTIF_LABEL[mo]).join("/"));
    return `${prefix} [${bits.join(", ")}]`;
  });

  const keyMoments: CoachKeyMoment[] = [...own]
    .filter((p) => p.loss >= 2)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, DIGEST_KEY_MOMENTS)
    .map((p) => ({
      id: `ply-${p.index}`,
      plyIndex: p.index,
      moveNumber: Math.floor(p.index / 2) + 1,
      san: p.san,
      label: LABEL_META[p.label].title,
      lossPct: Number(p.loss.toFixed(1)),
      bestMove: p.bestUci,
      evalAfter: evalText(p.cpAfter),
      phase: p.phase,
      motifs: p.motifs.map((mo) => MOTIF_LABEL[mo]),
    }))
    .sort((a, b) => a.moveNumber - b.moveNumber);

  const oppSide = side === "w" ? "b" : "w";
  const summary = review?.summary;

  return {
    side,
    playerName: side === "w" ? game.white.name : game.black.name,
    opponentName: side === "w" ? game.black.name : game.white.name,
    outcome:
      game.result.winner === "draw"
        ? `hoà (${game.result.reason})`
        : game.result.winner === side
          ? `thắng (${game.result.reason})`
          : `thua (${game.result.reason})`,
    variant: game.variantName,
    timeControl: game.timeControl,
    opening: game.opening,
    moveCount: game.moves.length,
    accuracy: review ? { player: review.accuracy[side], opponent: review.accuracy[oppSide] } : null,
    acpl: summary ? { player: summary.acpl[side], opponent: summary.acpl[oppSide] } : null,
    estimatedRating: summary ? summary.estimatedRating[side] : null,
    labelCounts: summary ? (summary.labels[side] as unknown as Record<string, number>) : null,
    reviewedAt: review?.reviewedAt ?? null,
    timeline,
    keyMoments,
    finalFen: game.finalFen,
  };
}
