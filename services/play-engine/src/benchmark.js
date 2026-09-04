/**
 * Canonical benchmark suites for the Nine64 play-engine.
 *
 * THIS FILE IS THE SINGLE SOURCE OF TRUTH for the EPD/position suites, their
 * scoring, their failure classification and the suite version. The Nine64
 * backend must NOT keep a second tactical suite: it calls `/benchmark` and
 * only verifies + stores what this service returns.
 *
 * Design rules:
 *  - Execution failures (timeout, pool_busy, engine_exit, engine_error) are
 *    NEVER classified as illegal chess moves.
 *  - A move is only "illegal" when Stockfish actually returned a move and the
 *    rules engine proves it illegal in that position.
 *  - A legal move that misses the goal is `legal_unsolved`, never an error.
 *  - Mate goals are verified SEMANTICALLY: any legal move that delivers
 *    checkmate solves the position, whatever UCI it uses.
 *
 * Copyright (C) 2026 Nine64. GPL-3.0-or-later.
 */
import { applyMove, createPosition, decodeEngineMove, isCheckmate, isLegal } from "./rules.js";

/** Suite identity: stored with every benchmark row so results stay comparable. */
export { BENCHMARK_SUITE_VERSION, SERVICE_BUILD_ID } from "./capabilities.js";

const MATE_IN_ONE = { type: "checkmate", maxPlies: 1 };
const LEGAL_MOVE = { type: "legal_move" };

/**
 * Deterministic EPD health gate: every entry is a forced mate in one.
 * Scoring is semantic (position after bestmove must be checkmate), so the
 * engine is free to choose any of several equivalent mating moves.
 */
export const EPD_SUITE = [
  { id: "mate_rook_01", fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", variant: "standard", goal: MATE_IN_ONE },
  { id: "mate_rook_02", fen: "2r3k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 1", variant: "standard", goal: MATE_IN_ONE },
  { id: "mate_rook_03", fen: "3r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", variant: "standard", goal: MATE_IN_ONE },
  { id: "mate_rook_04", fen: "7k/6pp/8/8/8/8/6PP/5R1K w - - 0 1", variant: "standard", goal: MATE_IN_ONE },
  { id: "mate_rook_05", fen: "7k/5ppp/8/8/8/8/5PPP/1R5K w - - 0 1", variant: "standard", goal: MATE_IN_ONE },
  { id: "mate_rook_box_01", fen: "k7/8/1K6/8/8/8/8/7R w - - 0 1", variant: "standard", goal: MATE_IN_ONE },
  { id: "mate_rook_box_02", fen: "2k5/8/2K5/8/8/8/8/7R w - - 0 1", variant: "standard", goal: MATE_IN_ONE },
  { id: "mate_rook_box_03", fen: "k7/7R/1K6/8/8/8/8/8 w - - 0 1", variant: "standard", goal: MATE_IN_ONE },
  { id: "mate_queen_scholar_01", fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4", variant: "standard", goal: MATE_IN_ONE },
  { id: "promotion_mate_01", fen: "6k1/4Pppp/8/8/8/8/5PPP/6K1 w - - 0 1", variant: "standard", goal: MATE_IN_ONE },
  { id: "smothered_mate_01", fen: "6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1", variant: "standard", goal: MATE_IN_ONE },
  { id: "black_mate_01", fen: "8/8/8/8/8/2k5/2q5/K7 b - - 0 1", variant: "standard", goal: MATE_IN_ONE },
  { id: "black_mate_02", fen: "8/8/8/8/8/1qk5/8/K7 b - - 0 1", variant: "standard", goal: MATE_IN_ONE },
];

/**
 * Health suite: any legal move passes. It also carries the Chess960 smoke
 * positions, so a castling-encoding regression in 960 mode fails the suite
 * instead of only failing in a live game.
 */
export const POSITION_SUITE = [
  { id: "startpos", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", variant: "standard", goal: LEGAL_MOVE },
  { id: "middlegame_01", fen: "r1bq1rk1/pp2ppbp/2np1np1/8/2BNP3/2N1B3/PPP2PPP/R2QK2R w KQ - 0 9", variant: "standard", goal: LEGAL_MOVE },
  { id: "endgame_kp_01", fen: "8/8/8/4k3/8/4K3/4P3/8 w - - 0 1", variant: "standard", goal: LEGAL_MOVE },
  { id: "castling_rights_01", fen: "r3k2r/pppq1ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPPQ1PPP/R3K2R w KQkq - 6 8", variant: "standard", goal: LEGAL_MOVE },
  { id: "endgame_rook_01", fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", variant: "standard", goal: LEGAL_MOVE },
  { id: "endgame_kp_02", fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", variant: "standard", goal: LEGAL_MOVE },
  { id: "endgame_bishop_01", fen: "8/8/4kpp1/3p1b2/p6P/2B5/6P1/6K1 b - - 0 1", variant: "standard", goal: LEGAL_MOVE },
  { id: "endgame_rook_02", fen: "8/8/1p1r1k2/p1pPN1p1/P3KnP1/1P6/8/3R4 b - - 0 1", variant: "standard", goal: LEGAL_MOVE },
  { id: "chess960_01", fen: "bqnbrkrn/pppppppp/8/8/8/8/PPPPPPPP/BQNBRKRN w KQkq - 0 1", variant: "chess960", goal: LEGAL_MOVE },
  { id: "chess960_02", fen: "rknbbqnr/pppppppp/8/8/8/8/PPPPPPPP/RKNBBQNR w KQkq - 0 1", variant: "chess960", goal: LEGAL_MOVE },
];

/** EPD is a deterministic health gate: nothing less than 100% is acceptable. */
export const REQUIRED_SCORE = { epd: 1, positions: 1 };

export const BENCHMARK_DEFAULT_MOVETIME_MS = { epd: 3000, positions: 1500 };
export const BENCHMARK_MIN_MOVETIME_MS = { epd: 3000, positions: 500 };
export const BENCHMARK_MAX_MOVETIME_MS = { epd: 5000, positions: 5000 };

/** Transient outcomes that may be retried; a tactical miss never is. */
const RETRYABLE = new Set(["pool_busy", "engine_exit"]);
const MAX_ATTEMPTS = 3; // one call + two retries

/** Full UCI normalization: lowercase, promotion piece preserved. */
export function normalizeUci(uci) {
  return typeof uci === "string" ? uci.trim().toLowerCase() : "";
}

/** Maps a thrown engine failure to a typed benchmark error code. */
export function classifyEngineError(err) {
  const message = err && typeof err.message === "string" ? err.message : "";
  if (message === "timeout") return "timeout";
  if (message === "pool_busy") return "pool_busy";
  if (message === "engine_exit" || message === "engine_dead") return "engine_exit";
  return "engine_error";
}

/** Board array (8 ranks x 8 files) parsed from the placement field, or null. */
function parsePlacement(placement) {
  const ranks = (placement ?? "").split("/");
  if (ranks.length !== 8) return null;
  const board = [];
  for (const rank of ranks) {
    const row = [];
    for (const ch of rank) {
      if (/[1-8]/.test(ch)) {
        for (let i = 0; i < Number(ch); i += 1) row.push(null);
      } else if (/[prnbqkPRNBQK]/.test(ch)) {
        row.push(ch);
      } else {
        return null;
      }
    }
    if (row.length !== 8) return null;
    board.push(row);
  }
  return board;
}

function findPieces(board, piece) {
  const found = [];
  for (let r = 0; r < 8; r += 1) {
    for (let f = 0; f < 8; f += 1) {
      if (board[r][f] === piece) found.push({ r, f });
    }
  }
  return found;
}

/** True when `fen` (any side to move) leaves that side's own king in check. */
function sideToMoveInCheck(variant, fen) {
  try {
    const position = createPosition(variant, fen);
    return typeof position.isCheck === "function" ? position.isCheck() : position.inCheck();
  } catch {
    return false;
  }
}

function withSideToMove(fen, color) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) return null;
  parts[1] = color;
  // A stale en-passant square belongs to the other side; drop it when flipping.
  if (parts.length > 3) parts[3] = "-";
  return parts.join(" ");
}

/**
 * Proves that a FEN describes a LEGAL game state, not merely a parseable one.
 * A benchmark must never search a position where the side that just moved is
 * still in check — Stockfish's answer there is undefined behaviour.
 * Returns an array of error codes (empty means legal).
 */
export function validateGameState(fen, variant = "standard") {
  const errors = [];
  const parts = typeof fen === "string" ? fen.trim().split(/\s+/) : [];
  if (parts.length < 4) return ["invalid_fen_syntax"];
  const [placement, active] = parts;
  if (active !== "w" && active !== "b") errors.push("invalid_active_color");
  const board = parsePlacement(placement);
  if (!board) return [...errors, "invalid_fen_syntax"];

  const whiteKings = findPieces(board, "K");
  const blackKings = findPieces(board, "k");
  if (whiteKings.length !== 1) errors.push("white_king_count");
  if (blackKings.length !== 1) errors.push("black_king_count");
  if (whiteKings.length === 1 && blackKings.length === 1) {
    const dr = Math.abs(whiteKings[0].r - blackKings[0].r);
    const df = Math.abs(whiteKings[0].f - blackKings[0].f);
    if (Math.max(dr, df) <= 1) errors.push("kings_adjacent");
  }
  for (const rank of [0, 7]) {
    if (board[rank].some((cell) => cell === "p" || cell === "P")) {
      errors.push("pawn_on_back_rank");
      break;
    }
  }
  if (errors.length > 0) return [...new Set(errors)];

  try {
    createPosition(variant, fen);
  } catch {
    return ["invalid_fen_syntax"];
  }

  const other = active === "w" ? "b" : "w";
  const otherFen = withSideToMove(fen, other);
  const sideNotToMoveInCheck = otherFen ? sideToMoveInCheck(variant, otherFen) : false;
  if (sideNotToMoveInCheck) errors.push("side_not_to_move_in_check");
  if (sideNotToMoveInCheck && sideToMoveInCheck(variant, fen)) errors.push("both_kings_in_check");

  return [...new Set(errors)];
}

/** Validates every suite FEN and every hard-coded acceptable move. */

export function validateSuite(suite) {
  const problems = [];
  const seen = new Set();
  for (const entry of suite) {
    const variant = entry.variant ?? "standard";
    if (!entry.id || seen.has(entry.id)) problems.push({ fen: entry.fen, error: "duplicate_or_missing_id" });
    seen.add(entry.id);
    let position;
    try {
      position = createPosition(variant, entry.fen);
    } catch {
      problems.push({ id: entry.id, fen: entry.fen, error: "invalid_fen" });
      continue;
    }
    for (const error of validateGameState(entry.fen, variant)) {
      problems.push({ id: entry.id, fen: entry.fen, error });
    }

    const goal = entry.goal;
    if (!goal || !["checkmate", "acceptable_moves", "legal_move"].includes(goal.type)) {
      problems.push({ id: entry.id, fen: entry.fen, error: "invalid_goal" });
      continue;
    }
    if (goal.type === "checkmate") {
      // A mate goal is only deterministic when at least one mating move exists.
      const mates = position
        .moves({ verbose: true })
        .filter((m) => isCheckmate(applyMove(variant, entry.fen, m) ?? createPosition(variant, entry.fen)));
      if (mates.length === 0) problems.push({ id: entry.id, fen: entry.fen, error: "no_mate_available" });
    }
    if (goal.type === "acceptable_moves") {
      if (!Array.isArray(goal.moves) || goal.moves.length === 0) {
        problems.push({ id: entry.id, fen: entry.fen, error: "empty_acceptable_moves" });
        continue;
      }
      for (const uci of goal.moves) {
        const decoded = decodeEngineMove(variant, entry.fen, normalizeUci(uci));
        if (!decoded || !isLegal(createPosition(variant, entry.fen), decoded)) {
          problems.push({ id: entry.id, fen: entry.fen, error: "illegal_expected_move", move: uci });
        }
      }
    }
  }
  return problems;
}

/**
 * Evaluates one search outcome against a suite entry.
 * `outcome` is either { ok: true, result } or { ok: false, errorCode }.
 */
export function evaluatePosition(entry, outcome, attempts = 1) {
  const variant = entry.variant ?? "standard";
  const base = {
    id: entry.id ?? null,
    fen: entry.fen,
    variant,
    goal: entry.goal ?? LEGAL_MOVE,
    bestmove: null,
    legal: false,
    solved: false,
    depth: null,
    nodes: null,
    nps: null,
    timeMs: null,
    tbHits: null,
    attempts,
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
    tbHits: Number.isFinite(res.tbHits) ? res.tbHits : null,
  };
  if (!bestmove) return { ...row, errorCode: "no_move" };

  let decoded = null;
  let legal = false;
  try {
    decoded = decodeEngineMove(variant, entry.fen, bestmove);
    legal = Boolean(decoded) && isLegal(createPosition(variant, entry.fen), decoded);
  } catch {
    return { ...row, errorCode: "invalid_position" };
  }
  if (!legal) return { ...row, legal: false, errorCode: "illegal_move" };

  const goal = entry.goal ?? LEGAL_MOVE;
  let solved = false;
  if (goal.type === "legal_move") {
    solved = true;
  } else if (goal.type === "acceptable_moves") {
    solved = (goal.moves ?? []).map(normalizeUci).includes(bestmove);
  } else if (goal.type === "checkmate") {
    const after = applyMove(variant, entry.fen, decoded);
    solved = Boolean(after) && isCheckmate(after);
  }
  // A legal move that misses the goal is a real tactical miss, not an error.
  return { ...row, legal: true, solved, errorCode: solved ? null : "legal_unsolved" };
}

/** Aggregates per-position rows into the structured benchmark detail. */
export function summarize(kind, rows, engineVersion) {
  const total = rows.length;
  const counters = {
    legalMoves: 0,
    legalUnsolved: 0,
    illegalMoves: 0,
    noMove: 0,
    timeouts: 0,
    poolBusy: 0,
    engineErrors: 0,
    invalidPositions: 0,
  };
  let solved = 0;
  let depth = 0;
  const failedPositions = [];

  for (const row of rows) {
    switch (row.errorCode) {
      case "timeout":
        counters.timeouts += 1;
        break;
      case "pool_busy":
        counters.poolBusy += 1;
        break;
      case "engine_exit":
      case "engine_error":
        counters.engineErrors += 1;
        break;
      case "no_move":
        counters.noMove += 1;
        break;
      case "illegal_move":
        counters.illegalMoves += 1;
        break;
      case "invalid_position":
        counters.invalidPositions += 1;
        break;
      default:
        break;
    }
    if (row.legal) counters.legalMoves += 1;
    if (row.legal && !row.solved) counters.legalUnsolved += 1;

    if (row.legal && Number.isFinite(row.depth)) depth = Math.max(depth, row.depth);
    if (row.solved) solved += 1;
    else {
      failedPositions.push({
        id: row.id,
        fen: row.fen,
        variant: row.variant,
        goal: row.goal,
        bestmove: row.bestmove,
        legal: row.legal,
        solved: false,
        depth: row.depth,
        timeMs: row.timeMs,
        attempts: row.attempts,
        errorCode: row.errorCode ?? "legal_unsolved",
      });
    }
  }

  const score = total ? solved / total : 0;
  const requiredScore = REQUIRED_SCORE[kind] ?? 1;
  const executionClean =
    counters.illegalMoves === 0 &&
    counters.timeouts === 0 &&
    counters.poolBusy === 0 &&
    counters.engineErrors === 0 &&
    counters.noMove === 0 &&
    counters.invalidPositions === 0;
  const passed = executionClean && total > 0 && score >= requiredScore;

  // Execution failures must never be reported merely as a tactics score.
  const failureReasons = [];
  if (counters.timeouts > 0) failureReasons.push("timeout");
  if (counters.poolBusy > 0) failureReasons.push("pool_busy");
  if (counters.noMove > 0) failureReasons.push("no_move");
  if (counters.illegalMoves > 0) failureReasons.push("illegal_move");
  if (counters.engineErrors > 0) failureReasons.push("engine_error");
  if (counters.invalidPositions > 0) failureReasons.push("invalid_position");
  if (score < requiredScore) failureReasons.push("tactics_score");

  return {
    engineVersion: engineVersion ?? null,
    depth,
    score,
    passed,
    detail: {
      kind,
      solved,
      total,
      requiredScore,
      ...counters,
      failedPositions,
      failureReasons,
      positions: rows,
    },
  };
}

/**
 * Runs a suite with an injected `search(entry, movetimeMs)` function so the
 * aggregation logic is unit-testable without a live engine. Positions run
 * strictly sequentially: a pool of size 1 must never be asked to search two
 * positions at once.
 */
export async function runSuite({ kind, suite, search, movetimeMs, engineVersion }) {
  const rows = [];
  for (const entry of suite) {
    let outcome = null;
    let attempts = 0;
    while (attempts < MAX_ATTEMPTS) {
      attempts += 1;
      try {
        outcome = { ok: true, result: await search(entry, movetimeMs) };
        break;
      } catch (err) {
        const errorCode = classifyEngineError(err);
        outcome = { ok: false, errorCode };
        if (!RETRYABLE.has(errorCode) || attempts >= MAX_ATTEMPTS) break;
        await new Promise((resolve) => setTimeout(resolve, attempts * 250));
      }
    }
    rows.push(evaluatePosition(entry, outcome ?? { ok: false, errorCode: "engine_error" }, attempts));
  }
  return summarize(kind, rows, engineVersion);
}

/** Clamped per-position search time for a suite benchmark. */
export function suiteMovetime(kind, requested) {
  const fallback = BENCHMARK_DEFAULT_MOVETIME_MS[kind] ?? 1500;
  const min = BENCHMARK_MIN_MOVETIME_MS[kind] ?? 100;
  const max = BENCHMARK_MAX_MOVETIME_MS[kind] ?? 5000;
  const value = Number(requested);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

/** Per-position engine request budget: generous relative to the search. */
export function suiteRequestTimeout(movetimeMs) {
  return Math.max(Math.trunc(movetimeMs) * 4, 20_000);
}
