import { describe, expect, it } from "vitest";
import type { Puzzle } from "./puzzleGen";
import { lineFromSan, normalisePuzzle } from "./puzzleGen";
import { attemptMove, initialSolverState, solverPlyCount } from "./puzzleSolver";
import { initialState } from "./fsrs";

function makePuzzle(fen: string, solution: Puzzle["solution"], alternates: Puzzle["alternates"] = {}): Puzzle {
  return {
    id: "t",
    fen,
    solution,
    alternates,
    solutionSan: solution[0]?.san ?? null,
    color: fen.split(" ")[1] === "b" ? "b" : "w",
    themes: [],
    rating: 1500,
    gameId: "g",
    ply: 0,
    swing: 40,
    createdAt: new Date().toISOString(),
    srs: initialState(),
    attempts: 0,
    solved: 0,
  };
}

// Back-rank mate in two: 1. Ra8+ Rxa8 2. Rxa8#
const BACK_RANK = "6k1/5ppp/8/8/8/8/8/R3R1K1 w - - 0 1";

describe("multi-move puzzle solver", () => {
  it("does not accept the first move as a full solution", () => {
    const line = lineFromSan(BACK_RANK, ["Ra8+", "Kh7"], 4);
    const puzzle = makePuzzle(BACK_RANK, line);
    expect(solverPlyCount(puzzle)).toBe(1);

    const longer = makePuzzle(BACK_RANK, [...line, { uci: "e1e8", san: "Re8#" }]);
    const state = initialSolverState(longer);
    const first = attemptMove(longer, state, "a1", "a8");
    expect(first.status).toBe("progress");
    expect(first.replySan).toBe("Kh7");
    expect(first.playedPlies).toBe(2);

    const wrong = attemptMove(longer, first, "e1", "e2");
    expect(wrong.status).toBe("wrong");
    expect(wrong.expected?.san).toBe("Re8#");

    const right = attemptMove(longer, first, "e1", "e8");
    expect(right.status).toBe("solved");
  });

  it("ignores illegal drops without penalising the solver", () => {
    const puzzle = makePuzzle(BACK_RANK, [{ uci: "a1a8", san: "Ra8+" }]);
    const state = initialSolverState(puzzle);
    const result = attemptMove(puzzle, state, "a1", "a5");
    expect(result.status).toBe("idle");
    const illegal = attemptMove(puzzle, state, "a1", "b3");
    expect(illegal.status).toBe("idle");
    expect(illegal.playedPlies).toBe(0);
  });

  it("accepts alternate winning moves and immediate mate", () => {
    const puzzle = makePuzzle(BACK_RANK, [{ uci: "a1a8", san: "Ra8+" }], { 0: ["e1e8"] });
    const state = initialSolverState(puzzle);
    expect(attemptMove(puzzle, state, "e1", "e8").status).toBe("solved");
  });

  it("handles promotion puzzles", () => {
    const fen = "8/P6k/8/8/8/8/8/6K1 w - - 0 1";
    const puzzle = makePuzzle(fen, [{ uci: "a7a8q", san: "a8=Q" }]);
    const state = initialSolverState(puzzle);
    expect(attemptMove(puzzle, state, "a7", "a8", "n").status).toBe("wrong");
    expect(attemptMove(puzzle, state, "a7", "a8", "q").status).toBe("solved");
  });

  it("solves defensive/quiet puzzles for black", () => {
    const fen = "6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1";
    const line = lineFromSan(fen, ["Kf8"], 1);
    const puzzle = makePuzzle(fen, line);
    expect(puzzle.color).toBe("b");
    const result = attemptMove(puzzle, initialSolverState(puzzle), "g8", "f8");
    expect(result.status).toBe("solved");
  });

  it("migrates legacy single-string puzzles", () => {
    const legacy = normalisePuzzle({
      id: "old",
      fen: BACK_RANK,
      solution: "a1a8",
      solutionSan: "Ra8+",
      color: "w",
    });
    expect(legacy?.solution).toEqual([{ uci: "a1a8", san: "Ra8+" }]);
    expect(normalisePuzzle({ fen: BACK_RANK })).toBeNull();
  });
});
