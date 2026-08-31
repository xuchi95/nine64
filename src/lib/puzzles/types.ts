/** Shared shapes for the Nine64 puzzle platform (personal + global catalog). */
import type { ThemeKey } from "./themes";

export type PuzzleSource = "personal" | "global";

export interface PuzzlePly {
  uci: string;
  san: string;
}

/** A fully-specified tactical puzzle: full sequence, not just the first move. */
export interface PlatformPuzzle {
  id: string;
  source: PuzzleSource;
  fen: string;
  /** Colour the solver plays. */
  color: "w" | "b";
  /** Principal line, alternating solver / forced reply, ending on a solver move. */
  solution: PuzzlePly[];
  /** Extra accepted solver moves per solution ply index (UCI). */
  alternates: Record<number, string[]>;
  themes: ThemeKey[];
  rating: number;
  ratingDeviation: number;
  phase: "opening" | "middlegame" | "endgame";
  opening: string | null;
  /** Personal puzzles link back to the game they came from. */
  gameId: string | null;
  ply: number | null;
  datasetSlug: string | null;
  license: string | null;
}

export interface SrsCard {
  puzzleId: string;
  source: PuzzleSource;
  difficulty: number;
  stability: number;
  reps: number;
  lapses: number;
  due: string;
  lastReview: string | null;
}

export interface AttemptSummary {
  puzzleId: string;
  themes: ThemeKey[];
  solved: boolean;
  hintsUsed: number;
  createdAt: string;
}
