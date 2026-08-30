import { Chess } from "chess.js";

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
