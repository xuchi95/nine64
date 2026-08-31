/** Puzzle-specific Glicko-2 rating (separate ladder from online play). */
import { DEFAULT_RATING, glicko2Update, type Rating } from "@/lib/rating/glicko2";

export const DEFAULT_PUZZLE_RATING: Rating = { rating: 1200, rd: 250, volatility: 0.06 };

export interface PuzzleRatingResult {
  before: Rating;
  after: Rating;
  delta: number;
}

/**
 * One attempt = one rating period against the puzzle as opponent.
 * Hints do not change the outcome score: a solve is a solve for rating, while
 * the learning score (which hints do cut) drives SRS and skill XP instead.
 */
export function applyPuzzleResult(
  current: Rating,
  puzzle: { rating: number; ratingDeviation: number },
  solved: boolean,
): PuzzleRatingResult {
  const before = current ?? { ...DEFAULT_PUZZLE_RATING };
  const after = glicko2Update(before, [
    {
      rating: puzzle.rating,
      rd: Math.max(30, Math.min(200, puzzle.ratingDeviation)),
      score: solved ? 1 : 0,
    },
  ]);
  return { before, after, delta: Math.round(after.rating - before.rating) };
}

/** Reverse update for the puzzle itself, used by admin difficulty recalculation. */
export function recalculatePuzzleRating(input: {
  rating: number;
  ratingDeviation: number;
  attempts: number;
  solved: number;
  averageSolverRating: number;
}): { rating: number; ratingDeviation: number } {
  if (input.attempts < 10) return { rating: input.rating, ratingDeviation: input.ratingDeviation };
  const successRate = Math.min(0.98, Math.max(0.02, input.solved / input.attempts));
  // Inverse logistic: rating where the average solver would score `successRate`.
  const implied = input.averageSolverRating - 400 * Math.log10(successRate / (1 - successRate));
  const weight = Math.min(1, input.attempts / 120);
  const rating = Math.round(input.rating * (1 - weight) + implied * weight);
  const rd = Math.max(40, Math.round(input.ratingDeviation * (1 - weight * 0.6)));
  return { rating: Math.max(400, Math.min(3000, rating)), ratingDeviation: rd };
}

export function ratingFromRow(row: {
  rating?: number | null;
  rating_deviation?: number | null;
  volatility?: number | null;
} | null | undefined): Rating {
  if (!row) return { ...DEFAULT_PUZZLE_RATING };
  return {
    rating: row.rating ?? DEFAULT_PUZZLE_RATING.rating,
    rd: Number(row.rating_deviation ?? DEFAULT_PUZZLE_RATING.rd),
    volatility: Number(row.volatility ?? DEFAULT_RATING.volatility),
  };
}
