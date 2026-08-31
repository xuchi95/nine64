import { Chess } from "chess.js";
import type { PuzzleMove } from "./puzzleGen";

/**
 * Structural shape the solver needs. Both personal puzzles (`Puzzle`) and
 * catalog puzzles (`PlatformPuzzle`) satisfy it.
 */
export interface SolvablePuzzle {
  fen: string;
  solution: PuzzleMove[];
  alternates?: Record<number, string[]>;
}

type Puzzle = SolvablePuzzle;

/**
 * Multi-move puzzle solver.
 *
 * A puzzle is only "solved" when every solver ply of the principal solution
 * has been played. After each accepted solver move the forced opponent reply
 * is applied automatically, and play continues.
 */
export interface SolverState {
  /** Position the solver is looking at right now. */
  fen: string;
  /** How many plies of `puzzle.solution` have been consumed. */
  playedPlies: number;
  status: "idle" | "progress" | "solved" | "wrong";
  /** Last move rendered on the board (solver move or auto reply). */
  lastMove: { from: string; to: string } | null;
}

export interface AttemptResult extends SolverState {
  /** SAN of the accepted solver move, when accepted. */
  playedSan: string | null;
  /** SAN of the automatic opponent reply, when one was played. */
  replySan: string | null;
  /** The move that was expected, when the attempt was wrong. */
  expected: PuzzleMove | null;
}

export function initialSolverState(puzzle: Puzzle): SolverState {
  return { fen: puzzle.fen, playedPlies: 0, status: "idle", lastMove: null };
}

function load(fen: string): Chess | null {
  const chess = new Chess();
  try {
    chess.load(fen);
    return chess;
  } catch {
    return null;
  }
}

function accepted(puzzle: Puzzle, index: number, uci: string, chess: Chess): boolean {
  const expected = puzzle.solution[index];
  if (!expected) return false;
  const normalise = (u: string) => (u.length > 4 ? u : u.slice(0, 4));
  if (normalise(expected.uci) === normalise(uci)) return true;
  if (expected.uci.slice(0, 4) === uci.slice(0, 4) && expected.uci.length === 4) return true;
  // Alternate winning moves are only accepted for solver plies.
  const alts = puzzle.alternates?.[index] ?? [];
  if (alts.some((a) => a.slice(0, 4) === uci.slice(0, 4))) return true;
  // Any move that mates immediately finishes the tactic.
  return chess.isCheckmate();
}

/**
 * Apply a solver attempt. Pure: caller stores the returned state.
 */
export function attemptMove(
  puzzle: Puzzle,
  state: SolverState,
  from: string,
  to: string,
  promotion?: "q" | "r" | "b" | "n",
): AttemptResult {
  const base: AttemptResult = {
    ...state,
    playedSan: null,
    replySan: null,
    expected: puzzle.solution[state.playedPlies] ?? null,
  };
  if (state.status === "solved" || state.status === "wrong") return base;

  const chess = load(state.fen);
  if (!chess) return { ...base, status: "wrong" };

  let applied;
  try {
    applied = chess.move({ from, to, promotion: promotion ?? "q" });
  } catch {
    applied = null;
  }
  if (!applied) return base; // illegal move: ignore, no penalty

  const uci = `${applied.from}${applied.to}${applied.promotion ?? ""}`;
  if (!accepted(puzzle, state.playedPlies, uci, chess)) {
    return {
      ...base,
      status: "wrong",
      fen: chess.fen(),
      lastMove: { from: applied.from, to: applied.to },
      playedSan: applied.san,
    };
  }

  let playedPlies = state.playedPlies + 1;
  let lastMove = { from: applied.from, to: applied.to };
  let replySan: string | null = null;

  // Tactic complete: no forced reply left, or the position is already over.
  if (playedPlies >= puzzle.solution.length || chess.isGameOver()) {
    return {
      fen: chess.fen(),
      playedPlies,
      status: "solved",
      lastMove,
      playedSan: applied.san,
      replySan: null,
      expected: null,
    };
  }

  // Play the forced opponent reply.
  const reply = puzzle.solution[playedPlies];
  if (reply) {
    try {
      const replyMove = chess.move({
        from: reply.uci.slice(0, 2),
        to: reply.uci.slice(2, 4),
        promotion: (reply.uci[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
      });
      if (replyMove) {
        replySan = replyMove.san;
        lastMove = { from: replyMove.from, to: replyMove.to };
        playedPlies += 1;
      }
    } catch {
      // Corrupt stored line: treat the tactic as complete rather than hanging.
      return {
        fen: chess.fen(),
        playedPlies,
        status: "solved",
        lastMove,
        playedSan: applied.san,
        replySan: null,
        expected: null,
      };
    }
  }

  const solved = playedPlies >= puzzle.solution.length || chess.isGameOver();
  return {
    fen: chess.fen(),
    playedPlies,
    status: solved ? "solved" : "progress",
    lastMove,
    playedSan: applied.san,
    replySan,
    expected: null,
  };
}

/** Number of solver moves the puzzle requires. */
export function solverPlyCount(puzzle: Puzzle): number {
  return Math.ceil(puzzle.solution.length / 2);
}
