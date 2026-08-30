import { Chess } from "chess.js";
import { timeControlIncrementMs } from "@/lib/chess/timeControls";

/** Stable, client-facing error codes for the canonical move pipeline. */
export type MoveErrorCode =
  | "GAME_NOT_FOUND"
  | "NOT_A_PARTICIPANT"
  | "GAME_NOT_ACTIVE"
  | "NOT_YOUR_TURN"
  | "ILLEGAL_MOVE"
  | "STALE_GAME_VERSION"
  | "INTERNAL_ERROR";

export type Promotion = "q" | "r" | "b" | "n";

export interface CanonicalMove {
  san: string;
  uci: string;
  fen: string;
  turn: "w" | "b";
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  isInsufficientMaterial: boolean;
  isThreefold: boolean;
  isGameOver: boolean;
}

/**
 * Validate an intent (from/to/promotion) against a canonical FEN and derive
 * every canonical value the database stores. The client never supplies these.
 */
export function applyIntent(
  currentFen: string,
  from: string,
  to: string,
  promotion?: Promotion,
): CanonicalMove | null {
  const chess = new Chess();
  try {
    chess.load(currentFen);
  } catch {
    return null;
  }

  let moved;
  try {
    moved = chess.move({ from, to, ...(promotion ? { promotion } : { promotion: "q" }) });
  } catch {
    return null;
  }
  if (!moved) return null;

  const isCheckmate = chess.isCheckmate();
  const isStalemate = chess.isStalemate();
  const isInsufficientMaterial = chess.isInsufficientMaterial();
  const isThreefold = chess.isThreefoldRepetition();
  const isDraw = chess.isDraw() || isStalemate || isInsufficientMaterial || isThreefold;

  return {
    san: moved.san,
    uci: `${moved.from}${moved.to}${moved.promotion ?? ""}`,
    fen: chess.fen(),
    turn: chess.turn(),
    isCheck: chess.inCheck(),
    isCheckmate,
    isStalemate,
    isDraw: isDraw && !isCheckmate,
    isInsufficientMaterial,
    isThreefold,
    isGameOver: isCheckmate || isDraw,
  };
}

export function sideToMoveFromFen(fen: string): "w" | "b" {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

export interface ClockInput {
  timeControl: string;
  whiteTimeMs: number;
  blackTimeMs: number;
  moverIsWhite: boolean;
  lastMoveAtMs: number | null;
  nowMs: number;
}

export interface ClockOutput {
  whiteTimeMs: number;
  blackTimeMs: number;
  flagged: boolean;
}

/**
 * Server-authoritative clocks: deduct wall-clock time from the mover, then add
 * the increment. Clients never send clock values.
 */
export function computeClocks(input: ClockInput): ClockOutput {
  const elapsed =
    input.lastMoveAtMs === null ? 0 : Math.max(0, input.nowMs - input.lastMoveAtMs);
  const increment = timeControlIncrementMs(input.timeControl);

  const moverRemaining = input.moverIsWhite ? input.whiteTimeMs : input.blackTimeMs;
  const afterElapsed = moverRemaining - elapsed;
  const flagged = afterElapsed <= 0;
  const next = Math.max(0, afterElapsed) + (flagged ? 0 : increment);

  return {
    whiteTimeMs: input.moverIsWhite ? next : input.whiteTimeMs,
    blackTimeMs: input.moverIsWhite ? input.blackTimeMs : next,
    flagged,
  };
}
