/**
 * Rule-engine abstraction.
 *
 * UI (ChessBoard, panels) and server code talk to this interface only; they
 * never import a concrete rule implementation. That way a variant can be
 * backed by a different engine without touching presentation code, and a
 * variant whose rules are not correctly implemented can be reported as
 * unsupported instead of silently producing illegal positions.
 */

export type RulesEngineId = "chessjs-standard" | "chess960-unimplemented";

export type RulesErrorCode =
  | "RULES_ENGINE_UNAVAILABLE"
  | "INVALID_FEN"
  | "ILLEGAL_MOVE";

export class RulesError extends Error {
  readonly code: RulesErrorCode;
  constructor(code: RulesErrorCode, message: string) {
    super(message);
    this.name = "RulesError";
    this.code = code;
  }
}

export interface AppliedMove {
  san: string;
  uci: string;
  from: string;
  to: string;
  color: "w" | "b";
  captured?: string | undefined;
  promotion?: string | undefined;
  /** FEN after the move. */
  fen: string;
}

export interface RulesPosition {
  fen(): string;
  turn(): "w" | "b";
  /** Legal destination squares for a piece, or all legal SAN moves when omitted. */
  legalTargets(square: string): string[];
  move(from: string, to: string, promotion?: "q" | "r" | "b" | "n"): AppliedMove | null;
  isCheck(): boolean;
  isGameOver(): boolean;
}

export interface ChessRulesAdapter {
  readonly engine: RulesEngineId;
  /** False when the engine cannot be trusted for this variant's rules. */
  readonly supported: boolean;
  /** Machine-readable reason when `supported` is false. */
  readonly unsupportedReason?: string;
  /** True when castling from arbitrary king/rook files is handled correctly. */
  readonly supportsArbitraryCastling: boolean;
  /** PGN `Variant` tag value, or null for classical chess. */
  readonly pgnVariantTag: string | null;
  startingFen(): string;
  createPosition(fen?: string): RulesPosition;
  /** Server-side validation of a move intent against a canonical FEN. */
  validateMove(
    fen: string,
    from: string,
    to: string,
    promotion?: "q" | "r" | "b" | "n",
  ): AppliedMove | null;
}
