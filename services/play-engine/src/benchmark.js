/**
 * Benchmark suites and the structured result model for the play-engine.
 *
 * Design rules (see Nine64 benchmark spec):
 *  - Execution failures (timeout, pool_busy, engine_exit, protocol errors) are
 *    NEVER classified as illegal chess moves.
 *  - A move is only "illegal" when Stockfish actually returned a move and the
 *    rules engine proves it illegal in that position.
 *  - Tactical scoring compares full normalized UCI against an acceptable-move
 *    set, never `startsWith`.
 *
 * Copyright (C) 2026 Nine64. GPL-3.0-or-later.
 */
import { createPosition, decodeEngineMove, isLegal } from "./rules.js";

/**
 * Deterministic tactical regression suite: every entry is a forced mate whose
 * full mating-move set is enumerable, so a correct Stockfish 18 must find one.
 * `acceptableMoves` holds every legal move that delivers the mate.
 */
export const EPD_SUITE = [
  { fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", acceptableMoves: ["a1a8"] },
  { fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4", acceptableMoves: ["f3f7"] },
  { fen: "2r3k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 1", acceptableMoves: ["c1c8"] },
  { fen: "3r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", acceptableMoves: ["d1d8"] },
  { fen: "7k/6pp/8/8/8/8/6PP/5R1K w - - 0 1", acceptableMoves: ["f1f8"] },
  { fen: "7k/5ppp/8/8/8/8/5PPP/1R5K w - - 0 1", acceptableMoves: ["b1b8"] },
  { fen: "k7/8/1K6/8/8/8/8/7R w - - 0 1", acceptableMoves: ["h1h8"] },
  { fen: "2k5/8/2K5/8/8/8/8/7R w - - 0 1", acceptableMoves: ["h1h8"] },
  { fen: "k7/7R/1K6/8/8/8/8/8 w - - 0 1", acceptableMoves: ["h7h8"] },
  // Promotion mate: full UCI (with promotion piece) must match.
  { fen: "6k1/4Pppp/8/8/8/8/5PPP/6K1 w - - 0 1", acceptableMoves: ["e7e8q", "e7e8r"] },
  // Smothered mate.
  { fen: "6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1", acceptableMoves: ["h6f7"] },
  // Black to move, two mating queen moves.
  { fen: "8/8/8/8/8/2k5/1q6/K7 b - - 0 1", acceptableMoves: ["c3c2", "c3b3"] },
];

/**
 * Health suite: any legal move passes; there is no expected tactical move.
 * It also carries the Chess960 smoke positions, so a castling-encoding
 * regression in 960 mode fails the suite instead of only failing in a game.
 */
export const POSITION_SUITE = [
  { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", acceptableMoves: [] },
  { fen: "r1bq1rk1/pp2ppbp/2np1np1/8/2BNP3/2N1B3/PPP2PPP/R2QK2R w KQ - 0 9", acceptableMoves: [] },
  { fen: "8/8/8/4k3/8/4K3/4P3/8 w - - 0 1", acceptableMoves: [] },
  { fen: "r3k2r/pppq1ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPPQ1PPP/R3K2R w KQkq - 6 8", acceptableMoves: [] },
  { fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", acceptableMoves: [] },
  { fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", acceptableMoves: [] },
  // Rook + pawn endgame, and a queen endgame: deeper search, still bounded.
  { fen: "8/8/4kpp1/3p1b2/p6P/2B5/6P1/6K1 b - - 0 1", acceptableMoves: [] },
  { fen: "8/8/1p1r1k2/p1pPN1p1/P3KnP1/1P6/8/3R4 b - - 0 1", acceptableMoves: [] },
  // Chess960 smoke: castling rights on non-standard start files.
  { fen: "bqnbrkrn/pppppppp/8/8/8/8/PPPPPPPP/BQNBRKRN w KQkq - 0 1", acceptableMoves: [], variant: "chess960" },
  { fen: "rknbbqnr/pppppppp/8/8/8/8/PPPPPPPP/RKNBBQNR w KQkq - 0 1", acceptableMoves: [], variant: "chess960" },
];

/** Suite identity: stored with every benchmark row so results stay comparable. */
export { BENCHMARK_SUITE_VERSION } from "./capabilities.js";

export const BENCHMARK_DEFAULT_MOVETIME_MS = { epd: 3000, positions: 1500 };
export const BENCHMARK_MAX_MOVETIME_MS = 10_000;


/** Full UCI normalization: lowercase, promotion piece preserved. */
export function normalizeUci(uci) {
  return typeof uci === "string" ? uci.trim().toLowerCase() : "";
}

/** Maps a thrown engine failure to a typed benchmark error code. */
export function classifyEngineError(err) {
  const message = err && typeof err.message === "string" ? err.message : "";
  if (message === "timeout") return "timeout";
  return "engine_error";
}

/** Validates every suite FEN and every acceptable move at load/test time. */
export function validateSuite(suite, variant = "standard") {
  const problems = [];
  for (const entry of suite) {
    let position;
    try {
      position = createPosition(variant, entry.fen);
    } catch {
      problems.push({ fen: entry.fen, error: "invalid_fen" });
      continue;
    }
    for (const uci of entry.acceptableMoves ?? []) {
      const decoded = decodeEngineMove(variant, entry.fen, normalizeUci(uci));
      if (!decoded || !isLegal(createPosition(variant, entry.fen), decoded)) {
        problems.push({ fen: entry.fen, error: "illegal_expected_move", move: uci });
      }
    }
    void position;
  }
  return problems;
}

/**
 * Evaluates one search outcome against a suite entry.
 * `outcome` is either { ok: true, result } or { ok: false, errorCode }.
 */
export function evaluatePosition(entry, outcome, variant = "standard") {
  const base = {
    fen: entry.fen,
    bestmove: null,
    legal: false,
    solved: false,
    depth: null,
    nodes: null,
    nps: null,
    timeMs: null,
    errorCode: null,
  };
  if (!outcome.ok) return { ...base, errorCode: outcome.errorCode };

  const res = outcome.result ?? {};
  const bestmove = res.bestmove ? normalizeUci(res.bestmove) : null;
  const row = {
    ...base,
    bestmove,
    depth: Number.isFinite(res.depth) ? res.depth : null,
    nodes: Number.isFinite(res.nodes) ? res.nodes : null,
    nps: Number.isFinite(res.nps) ? res.nps : null,
    timeMs: Number.isFinite(res.timeMs) ? res.timeMs : null,
  };
  if (!bestmove) return { ...row, errorCode: "no_move" };

  const decoded = decodeEngineMove(variant, entry.fen, bestmove);
  const legal = Boolean(decoded) && isLegal(createPosition(variant, entry.fen), decoded);
  if (!legal) return { ...row, legal: false, errorCode: "illegal_move" };

  const acceptable = (entry.acceptableMoves ?? []).map(normalizeUci);
  const solved = acceptable.length === 0 ? true : acceptable.includes(bestmove);
  const belowDepth =
    Number.isFinite(entry.minDepth) && (row.depth ?? 0) < entry.minDepth ? true : false;
  return { ...row, legal: true, solved: solved && !belowDepth };
}

/** Aggregates per-position rows into the structured benchmark detail. */
export function summarize(kind, rows, engineVersion) {
  const total = rows.length;
  const counters = { legalMoves: 0, illegalMoves: 0, noMove: 0, timeouts: 0, engineErrors: 0 };
  let solved = 0;
  let depth = 0;
  const failedPositions = [];

  for (const row of rows) {
    if (row.errorCode === "timeout") counters.timeouts += 1;
    else if (row.errorCode === "engine_error") counters.engineErrors += 1;
    else if (row.errorCode === "no_move") counters.noMove += 1;
    else if (row.errorCode === "illegal_move") counters.illegalMoves += 1;
    else if (row.legal) counters.legalMoves += 1;

    if (row.legal && Number.isFinite(row.depth)) depth = Math.max(depth, row.depth);
    if (row.solved) solved += 1;
    else failedPositions.push({ fen: row.fen, bestmove: row.bestmove, errorCode: row.errorCode });
  }

  const score = total ? solved / total : 0;
  const executionClean =
    counters.illegalMoves === 0 &&
    counters.timeouts === 0 &&
    counters.engineErrors === 0 &&
    counters.noMove === 0;
  const passed =
    kind === "epd"
      ? executionClean && total > 0 && score >= 0.8
      : executionClean && total > 0 && counters.legalMoves === total;

  const failureReasons = [];
  if (counters.timeouts > 0) failureReasons.push("timeout");
  if (counters.noMove > 0) failureReasons.push("no_move");
  if (counters.illegalMoves > 0) failureReasons.push("illegal_move");
  if (counters.engineErrors > 0) failureReasons.push("engine_error");
  if (kind === "epd" && score < 0.8) failureReasons.push("tactics_score");

  return {
    engineVersion: engineVersion ?? null,
    depth,
    score,
    passed,
    detail: {
      kind,
      solved,
      total,
      ...counters,
      failedPositions,
      failureReasons,
      positions: rows,
    },
  };
}

/**
 * Runs a suite with an injected `search({ fen, movetimeMs, timeoutMs })`
 * function so the aggregation logic is unit-testable without a live engine.
 */
export async function runSuite({ kind, suite, search, movetimeMs, engineVersion, variant = "standard" }) {
  const rows = [];
  for (const entry of suite) {
    let outcome;
    try {
      const result = await search(entry, movetimeMs);
      outcome = { ok: true, result };
    } catch (err) {
      outcome = { ok: false, errorCode: classifyEngineError(err) };
    }
    // A per-entry variant wins so one suite can mix Standard and Chess960.
    rows.push(evaluatePosition(entry, outcome, entry.variant ?? variant));

  }
  return summarize(kind, rows, engineVersion);
}

/** Clamped per-position search time for a suite benchmark. */
export function suiteMovetime(kind, requested) {
  const fallback = BENCHMARK_DEFAULT_MOVETIME_MS[kind] ?? 1500;
  const value = Number(requested);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.max(Math.trunc(value), 100), BENCHMARK_MAX_MOVETIME_MS);
}
