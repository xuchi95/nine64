import type { Variation } from "./variation";
import type { MoveLabel } from "./classify";
import type { Motif } from "./motifs";
import type { GamePhase } from "./phase";

export interface PlyAnalysis {
  /** Ply index (0-based) matching the game's move list. */
  index: number;
  color: "w" | "b";
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** Evaluation after the move, white POV centipawns. */
  cpAfter: number | null;
  /** Engine's preferred move in the position before this one (uci). */
  bestUci: string | null;
  label: MoveLabel;
  /** Win-percentage loss versus the engine move. */
  loss: number;
  /** Centipawn loss versus the engine move (mover POV). Null when unknown. */
  cpLoss?: number | null;
  accuracy: number;
  weight: number;
  complexity: number;
  see: number;
  motifs: Motif[];
  phase: GamePhase;
  /** Time spent on the move in ms, when known. */
  spentMs?: number | null;
  /** Deep mode: engine variations for the position before this move. */
  variations?: Variation[];
  /** Deep mode: the mover's own move continued by the engine, in SAN. */
  playedPvSan?: string[];
}

export interface DeepReviewSummary {
  acpl: { w: number; b: number };
  estimatedRating: { w: number; b: number };
  labels: { w: Record<MoveLabel, number>; b: Record<MoveLabel, number> };
  complexityAvg: number;
  plans: string[];
}
