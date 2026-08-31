/**
 * Nine64 Academy — lesson runtime rules.
 *
 * Pure functions over chess.js so the same checks run in the player, in tests
 * and (later) server-side validation. No React, no I/O.
 */
import { Chess } from "chess.js";
import type { Grade } from "./fsrs";
import type { LessonStep, SuccessCondition } from "./lessonTypes";

export interface PlayedMove {
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}

export type AnswerStatus = "correct" | "alternate" | "wrong";

export interface AnswerResult {
  status: AnswerStatus;
  san: string;
  uci: string;
  /** FEN after the move (empty when the move was illegal). */
  fen: string;
  /** Note attached to an accepted alternate move. */
  alternateIndex: number | null;
}

function uciOf(m: { from: string; to: string; promotion?: string }): string {
  return `${m.from}${m.to}${m.promotion ?? ""}`;
}

/** Resolves a SAN or UCI token in a position into its canonical SAN + UCI. */
export function resolveToken(fen: string, token: string): { san: string; uci: string } | null {
  const raw = token.trim();
  if (!raw) return null;
  const chess = new Chess(fen);
  // SAN first (most authored content uses it).
  try {
    const move = chess.move(raw);
    if (move) return { san: move.san, uci: uciOf(move) };
  } catch {
    /* not SAN — fall through to UCI */
  }
  const lower = raw.toLowerCase();
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(lower)) return null;
  const chess2 = new Chess(fen);
  try {
    const move = chess2.move({
      from: lower.slice(0, 2),
      to: lower.slice(2, 4),
      promotion: (lower[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
    });
    if (move) return { san: move.san, uci: uciOf(move) };
  } catch {
    return null;
  }
  return null;
}

function matches(fen: string, token: string, uci: string, san: string): boolean {
  const resolved = resolveToken(fen, token);
  if (!resolved) return false;
  return resolved.uci === uci || resolved.san === san;
}

/** Evaluates the success condition of a step against the resulting position. */
export function meetsSuccess(
  condition: SuccessCondition | undefined,
  fenAfter: string,
  matchedExpected: boolean,
): boolean {
  if (!condition) return matchedExpected;
  switch (condition.kind) {
    case "checkmate": {
      const chess = new Chess(fenAfter);
      return chess.isCheckmate();
    }
    case "reach_fen":
      return Boolean(condition.fen) && fenAfter.split(" ")[0] === condition.fen!.split(" ")[0];
    case "any_expected":
    case "expected_move":
    case "no_loss_in_line":
    case "engine_result":
    default:
      return matchedExpected;
  }
}

/** Checks a played move for `find_move` / `drag_piece` / `play_continuation`. */
export function checkAnswer(
  step: LessonStep,
  fen: string,
  played: PlayedMove,
  expectedOverride?: string[],
): AnswerResult {
  const chess = new Chess(fen);
  let move: { san: string; from: string; to: string; promotion?: string } | null = null;
  try {
    move = chess.move({ from: played.from, to: played.to, promotion: played.promotion ?? "q" });
  } catch {
    move = null;
  }
  if (!move) return { status: "wrong", san: "", uci: "", fen: "", alternateIndex: null };

  const uci = uciOf(move);
  const fenAfter = chess.fen();
  const expected = expectedOverride ?? step.expectedMoves;

  if (step.type === "drag_piece" && step.targetSquares.length > 0) {
    const ok = step.targetSquares.includes(move.to);
    return { status: ok ? "correct" : "wrong", san: move.san, uci, fen: fenAfter, alternateIndex: null };
  }

  const hit = expected.some((token) => matches(fen, token, uci, move!.san));
  if (hit && meetsSuccess(step.success, fenAfter, true)) {
    return { status: "correct", san: move.san, uci, fen: fenAfter, alternateIndex: null };
  }
  const altIndex = step.alternateMoves.findIndex((alt) => matches(fen, alt.move, uci, move!.san));
  if (altIndex >= 0) {
    return { status: "alternate", san: move.san, uci, fen: fenAfter, alternateIndex: altIndex };
  }
  // No expected list at all → any legal move that satisfies the condition passes.
  if (expected.length === 0 && meetsSuccess(step.success, fenAfter, true)) {
    return { status: "correct", san: move.san, uci, fen: fenAfter, alternateIndex: null };
  }
  return { status: "wrong", san: move.san, uci, fen: fenAfter, alternateIndex: null };
}

/** Applies a SAN token to a FEN, returning the new FEN (or null when illegal). */
export function applySan(fen: string, san: string): string | null {
  const chess = new Chess(fen);
  try {
    if (!chess.move(san)) return null;
  } catch {
    return null;
  }
  return chess.fen();
}

export interface StepOutcome {
  stepId: string;
  wrong: number;
  hintUsed: boolean;
}

/** 0..100 score for a completed lesson attempt. */
export function scoreAttempt(outcomes: readonly StepOutcome[]): number {
  if (outcomes.length === 0) return 100;
  const penalty = outcomes.reduce(
    (sum, o) => sum + Math.min(1, o.wrong * 0.35) + (o.hintUsed ? 0.2 : 0),
    0,
  );
  const raw = 1 - penalty / outcomes.length;
  return Math.max(0, Math.min(100, Math.round(raw * 100)));
}

/** Rolling mastery: 60% history + 40% latest attempt, clamped to 0..100. */
export function nextMastery(previous: number, score: number): number {
  const value = previous <= 0 ? score : previous * 0.6 + score * 0.4;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Maps a step outcome to an FSRS grade for the lesson review card. */
export function gradeFor(outcome: StepOutcome): Grade {
  if (outcome.wrong >= 2) return 1;
  if (outcome.wrong === 1) return 2;
  if (outcome.hintUsed) return 3;
  return 4;
}
