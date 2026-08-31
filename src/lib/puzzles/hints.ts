/**
 * Hint ladder: piece -> idea -> source square -> target square -> solution.
 * Each rung costs learning score, so a fully-hinted solve teaches (and scores)
 * far less than an unaided one.
 */
import { Chess } from "chess.js";
import type { PlatformPuzzle } from "./types";
import type { ThemeKey } from "./themes";

export const HINT_LEVELS = [1, 2, 3, 4, 5] as const;
export type HintLevel = (typeof HINT_LEVELS)[number];

export type HintKind = "piece" | "idea" | "from" | "to" | "solution";

export const HINT_KIND_BY_LEVEL: Record<HintLevel, HintKind> = {
  1: "piece",
  2: "idea",
  3: "from",
  4: "to",
  5: "solution",
};

export interface Hint {
  level: HintLevel;
  kind: HintKind;
  /** Piece letter for "piece", theme key for "idea", square for from/to, SAN for solution. */
  value: string;
  /** Square to highlight on the board, when the rung reveals one. */
  square: string | null;
}

const PIECE_NAME: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/** Build the hint at `level` for the current position of an in-progress solve. */
export function hintFor(
  puzzle: PlatformPuzzle,
  fen: string,
  playedPlies: number,
  level: HintLevel,
): Hint | null {
  const next = puzzle.solution[playedPlies];
  if (!next) return null;
  const from = next.uci.slice(0, 2);
  const to = next.uci.slice(2, 4);

  switch (HINT_KIND_BY_LEVEL[level]) {
    case "piece": {
      let piece: string | null = null;
      try {
        piece = new Chess(fen).get(from as never)?.type ?? null;
      } catch {
        piece = null;
      }
      return {
        level,
        kind: "piece",
        value: piece ? (PIECE_NAME[piece] ?? piece) : "piece",
        square: null,
      };
    }
    case "idea":
      return {
        level,
        kind: "idea",
        value: (puzzle.themes[0] ?? "only_move") satisfies ThemeKey | string as string,
        square: null,
      };
    case "from":
      return { level, kind: "from", value: from, square: from };
    case "to":
      return { level, kind: "to", value: to, square: to };
    case "solution":
      return { level, kind: "solution", value: next.san, square: to };
  }
}

/**
 * Learning score for a solve, 0-100. Hints, retries and slow solving all cut it.
 * Rating updates use the raw solved/failed result; the learning score only
 * drives SRS grade and skill XP, so hint abuse cannot inflate rating either.
 */
export function learningScore(input: {
  solved: boolean;
  hintsUsed: number;
  wrongMoves: number;
  seconds: number;
  plies: number;
}): number {
  if (!input.solved) return 0;
  const expected = Math.max(8, input.plies * 10);
  const speed = Math.max(0.5, Math.min(1, expected / Math.max(1, input.seconds)));
  const hintPenalty = Math.min(80, input.hintsUsed * 18);
  const wrongPenalty = Math.min(30, input.wrongMoves * 15);
  return Math.max(0, Math.round((100 - hintPenalty - wrongPenalty) * speed));
}

/** FSRS grade derived from the learning score. */
export function gradeFromLearningScore(score: number, solved: boolean): 1 | 2 | 3 | 4 {
  if (!solved) return 1;
  if (score >= 80) return 4;
  if (score >= 45) return 3;
  return 2;
}
