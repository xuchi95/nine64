import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { attemptMove, initialSolverState } from "@/lib/learn/puzzleSolver";
import { review, initialState } from "@/lib/learn/fsrs";
import { applyPuzzleResult, recalculatePuzzleRating, DEFAULT_PUZZLE_RATING } from "./rating";
import { duplicationPenalty, scorePuzzle, selectPuzzles, type SelectionContext } from "./selection";
import { detectThemesFromLine } from "./themes";
import { gradeFromLearningScore, hintFor, learningScore } from "./hints";
import { rampTarget, sprintPoints } from "./modes";
import type { PlatformPuzzle, SrsCard } from "./types";

/** Build a canonical solution line from SAN, failing loudly on illegal input. */
function line(fen: string, sans: string[]) {
  const chess = new Chess(fen);
  return sans.map((san) => {
    const applied = chess.move(san);
    if (!applied) throw new Error(`illegal SAN ${san}`);
    return { uci: `${applied.from}${applied.to}${applied.promotion ?? ""}`, san: applied.san };
  });
}

function puzzleOf(partial: Partial<PlatformPuzzle> & Pick<PlatformPuzzle, "id" | "fen" | "solution">): PlatformPuzzle {
  return {
    source: "global",
    color: "w",
    alternates: {},
    themes: [],
    rating: 1500,
    ratingDeviation: 100,
    phase: "middlegame",
    opening: null,
    gameId: null,
    ply: null,
    datasetSlug: null,
    license: null,
    ...partial,
  };
}

describe("multi-move puzzles", () => {
  const fen = "7k/6pp/8/8/8/8/8/R6K w - - 0 1";
  const solution = line(fen, ["Ra8+", "Kh7", "Ra7"]);
  const puzzle = puzzleOf({ id: "multi", fen, solution });

  it("is only solved after the full sequence, not the first move", () => {
    let state = initialSolverState(puzzle);
    const first = attemptMove(puzzle, state, "a1", "a8");
    expect(first.status).toBe("progress");
    expect(first.replySan).toBe("Kh7");
    state = first;
    const second = attemptMove(puzzle, state, "a8", "a7");
    expect(second.status).toBe("solved");
  });

  it("rejects a wrong branch and reveals the expected move", () => {
    const wrong = attemptMove(puzzle, initialSolverState(puzzle), "a1", "a4");
    expect(wrong.status).toBe("wrong");
    expect(wrong.expected?.san).toBe("Ra8+");
  });

  it("ignores illegal drops without penalising the solver", () => {
    const state = initialSolverState(puzzle);
    const illegal = attemptMove(puzzle, state, "a1", "b3");
    expect(illegal.status).toBe("idle");
    expect(illegal.playedSan).toBeNull();
  });
});

describe("mate and promotion puzzles", () => {
  it("solves a back-rank mate and tags the themes", () => {
    const fen = "6k1/5ppp/8/8/8/8/8/R6K w - - 0 1";
    const solution = line(fen, ["Ra8#"]);
    const puzzle = puzzleOf({ id: "mate", fen, solution });
    const res = attemptMove(puzzle, initialSolverState(puzzle), "a1", "a8");
    expect(res.status).toBe("solved");
    const themes = detectThemesFromLine(fen, solution);
    expect(themes).toContain("mate");
    expect(themes).toContain("back_rank");
  });

  it("requires the right promotion piece", () => {
    const fen = "7k/P5R1/8/8/8/8/8/7K w - - 0 1";
    const solution = line(fen, ["a8=Q#"]);
    const puzzle = puzzleOf({ id: "promo", fen, solution, themes: ["promotion"] });
    const queen = attemptMove(puzzle, initialSolverState(puzzle), "a7", "a8", "q");
    expect(queen.status).toBe("solved");
    expect(detectThemesFromLine(fen, solution)).toContain("promotion");

    const knight = attemptMove(puzzle, initialSolverState(puzzle), "a7", "a8", "n");
    expect(knight.status).toBe("wrong");
  });
});

describe("alternative valid solutions", () => {
  it("accepts a stored alternate first move", () => {
    const fen = "6k1/5ppp/8/8/8/8/1R6/R6K w - - 0 1";
    const solution = line(fen, ["Ra8#"]);
    const alt = new Chess(fen).move("Rb8#");
    const puzzle = puzzleOf({
      id: "alt",
      fen,
      solution,
      alternates: { 0: [`${alt!.from}${alt!.to}`] },
    });
    const res = attemptMove(puzzle, initialSolverState(puzzle), "b2", "b8");
    expect(res.status).toBe("solved");
  });
});

describe("SRS updates", () => {
  it("pushes the due date out on a good grade and resets it on a lapse", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const first = review(initialState(now), 3, now);
    expect(first.reps).toBe(1);
    expect(new Date(first.due).getTime()).toBeGreaterThan(now.getTime());

    const later = new Date("2026-01-10T00:00:00Z");
    const lapse = review(first, 1, later);
    expect(lapse.lapses).toBe(1);
    expect(new Date(lapse.due).getTime() - later.getTime()).toBeLessThanOrEqual(86_400_000 + 1000);
  });

  it("derives the FSRS grade from the learning score", () => {
    const clean = learningScore({ solved: true, hintsUsed: 0, wrongMoves: 0, seconds: 8, plies: 3 });
    const hinted = learningScore({ solved: true, hintsUsed: 3, wrongMoves: 0, seconds: 8, plies: 3 });
    expect(clean).toBeGreaterThan(hinted);
    expect(gradeFromLearningScore(clean, true)).toBe(4);
    expect(gradeFromLearningScore(hinted, true)).toBeLessThan(4);
    expect(gradeFromLearningScore(0, false)).toBe(1);
  });
});

describe("puzzle rating", () => {
  it("rises on a solve and falls on a failure", () => {
    const puzzle = { rating: 1500, ratingDeviation: 90 };
    const win = applyPuzzleResult({ ...DEFAULT_PUZZLE_RATING }, puzzle, true);
    const loss = applyPuzzleResult({ ...DEFAULT_PUZZLE_RATING }, puzzle, false);
    expect(win.delta).toBeGreaterThan(0);
    expect(loss.delta).toBeLessThan(0);
    expect(win.after.rd).toBeLessThan(DEFAULT_PUZZLE_RATING.rd);
  });

  it("recalculates catalog difficulty only with enough attempts", () => {
    const stable = recalculatePuzzleRating({
      rating: 1500,
      ratingDeviation: 100,
      attempts: 4,
      solved: 1,
      averageSolverRating: 1400,
    });
    expect(stable.rating).toBe(1500);

    const harder = recalculatePuzzleRating({
      rating: 1500,
      ratingDeviation: 100,
      attempts: 200,
      solved: 20,
      averageSolverRating: 1400,
    });
    expect(harder.rating).toBeGreaterThan(1500);
  });
});

describe("selection", () => {
  const now = new Date("2026-02-01T00:00:00Z");
  const base: SelectionContext = {
    rating: 1500,
    weakness: { fork: 80 },
    cards: {},
    recentPuzzleIds: [],
    sessionThemes: [],
    now,
  };

  it("prefers rating-matched puzzles in a weak theme", () => {
    const near = puzzleOf({ id: "near", fen: "8/8/8/8/8/8/8/K6k w - - 0 1", solution: [], rating: 1510, themes: ["fork"] });
    const far = puzzleOf({ id: "far", fen: "8/8/8/8/8/8/8/K6k w - - 0 1", solution: [], rating: 1950, themes: ["pin"] });
    expect(scorePuzzle(near, base).score).toBeGreaterThan(scorePuzzle(far, base).score);
  });

  it("avoids repeating a recently seen puzzle unless SRS asks for it", () => {
    const p = puzzleOf({ id: "recent", fen: "8/8/8/8/8/8/8/K6k w - - 0 1", solution: [], rating: 1500 });
    const notDue: SrsCard = {
      puzzleId: "recent",
      source: "global",
      difficulty: 5,
      stability: 10,
      reps: 2,
      lapses: 0,
      due: "2026-03-01T00:00:00Z",
      lastReview: "2026-01-25T00:00:00Z",
    };
    const due: SrsCard = { ...notDue, due: "2026-01-20T00:00:00Z" };

    expect(duplicationPenalty("recent", ["recent"], notDue, now)).toBeGreaterThan(0.5);
    expect(duplicationPenalty("recent", ["recent"], due, now)).toBeLessThan(0.2);

    const fresh = puzzleOf({ id: "fresh", fen: "8/8/8/8/8/8/8/K6k w - - 0 1", solution: [], rating: 1500 });
    const ranked = selectPuzzles([p, fresh], { ...base, recentPuzzleIds: ["recent"], cards: { recent: notDue } }, 2);
    expect(ranked[0]?.puzzle.id).toBe("fresh");

    const rankedDue = selectPuzzles([p, fresh], { ...base, recentPuzzleIds: ["recent"], cards: { recent: due } }, 2);
    expect(rankedDue[0]?.puzzle.id).toBe("recent");
    expect(rankedDue[0]?.reasons).toContain("srs_due");
  });
});

describe("hint ladder", () => {
  const fen = "7k/6pp/8/8/8/8/8/R6K w - - 0 1";
  const puzzle = puzzleOf({ id: "hint", fen, solution: line(fen, ["Ra8+", "Kh7", "Ra7"]), themes: ["back_rank"] });

  it("escalates piece -> idea -> from -> to -> solution", () => {
    expect(hintFor(puzzle, fen, 0, 1)?.value).toBe("rook");
    expect(hintFor(puzzle, fen, 0, 2)?.value).toBe("back_rank");
    expect(hintFor(puzzle, fen, 0, 3)?.value).toBe("a1");
    expect(hintFor(puzzle, fen, 0, 4)?.value).toBe("a8");
    expect(hintFor(puzzle, fen, 0, 5)?.value).toBe("Ra8+");
  });
});

describe("run modes", () => {
  it("ramps difficulty in sprint and survival only", () => {
    expect(rampTarget("adaptive", 1500, 5)).toBe(1500);
    expect(rampTarget("sprint", 1500, 4)).toBeGreaterThan(1500);
    expect(rampTarget("survival", 1500, 4)).toBeGreaterThan(rampTarget("sprint", 1500, 4));
  });

  it("scores harder puzzles higher and rewards streaks", () => {
    expect(sprintPoints(2000, 0)).toBeGreaterThan(sprintPoints(1000, 0));
    expect(sprintPoints(1500, 9)).toBeGreaterThan(sprintPoints(1500, 0));
  });
});
