/**
 * Rule-engine abstraction.
 *
 * UI (ChessBoard, panels) and server code talk to this interface only; they
 * never import a concrete rule implementation and never receive a raw engine
 * object. That way a variant can be backed by a different engine without
 * touching presentation code.
 *
 * Two rule engines exist:
 *   - `chessjs-standard`  — chess.js, classical FIDE rules (perft verified).
 *   - `void57-chess960`   — void57-chess, Chess960 rules incl. arbitrary
 *                           king/rook files and both castling directions.
 */

export type RulesEngineId = "chessjs-standard" | "void57-chess960" | "chessops-variant";

export type RulesErrorCode =
  | "RULES_ENGINE_UNAVAILABLE"
  | "INVALID_FEN"
  | "ILLEGAL_MOVE"
  | "CHESS960_INVALID_FEN"
  | "CHESS960_MOVE_DECODE_FAILED"
  | "CHESS960_ENGINE_PROTOCOL_MISMATCH"
  | "CHESS960_ILLEGAL_CASTLE"
  | "CHESS960_STATE_DIVERGENCE"
  | "CHESS960_ENGINE_ILLEGAL_MOVE";

export class RulesError extends Error {
  readonly code: RulesErrorCode;
  readonly meta: Record<string, string | number | null>;
  constructor(
    code: RulesErrorCode,
    message: string,
    meta: Record<string, string | number | null> = {},
  ) {
    super(message);
    this.name = "RulesError";
    this.code = code;
    this.meta = meta;
  }
}

export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type PieceColor = "w" | "b";
export type PromotionPiece = "q" | "r" | "b" | "n";

export interface BoardPiece {
  square: string;
  type: PieceType;
  color: PieceColor;
}

export type CastleSide = "king" | "queen";

export interface AppliedMove {
  san: string;
  /**
   * Nine64 canonical coordinate notation ("app UCI"): for a castle this is the
   * KING START square followed by the KING FINAL square (e1g1 / e1c1), never
   * the Stockfish UCI_Chess960 king-takes-rook encoding.
   */
  uci: string;
  from: string;
  to: string;
  color: PieceColor;
  captured?: PieceType | undefined;
  promotion?: PromotionPiece | undefined;
  /** Crazyhouse: the pocket piece dropped by this move. */
  drop?: PieceType | undefined;
  /** FEN after the move. */
  fen: string;
  /** Castling metadata, deterministic — the UI never infers it from geometry. */
  castle?:
    | {
        side: CastleSide;
        kingFrom: string;
        kingTo: string;
        rookFrom: string;
        rookTo: string;
      }
    | undefined;
}

export interface RulesPosition {
  fen(): string;
  turn(): PieceColor;
  pieceAt(square: string): BoardPiece | null;
  boardPieces(): BoardPiece[];
  /**
   * Legal destination squares for a piece. For castling this is the FINAL KING
   * square (g/c file), so the board UI never asks the user to drag the king
   * onto its own rook.
   */
  legalTargets(square: string): string[];
  legalMoves(): { from: string; to: string; san: string; promotion?: PromotionPiece }[];
  move(from: string, to: string, promotion?: PromotionPiece): AppliedMove | null;
  historySan(): string[];
  isCheck(): boolean;
  isCheckmate(): boolean;
  isStalemate(): boolean;
  isInsufficientMaterial(): boolean;
  isThreefoldRepetition(): boolean;
  isDraw(): boolean;
  isGameOver(): boolean;
  needsPromotion(from: string, to: string): boolean;
  /** King square of a side, or null when absent (never in a legal position). */
  kingSquare(color: PieceColor): string | null;
  clone(): RulesPosition;

  // ---- optional variant extensions -------------------------------------
  /**
   * Crazyhouse pocket for a side. Undefined on engines without pockets, so a
   * caller must feature-detect rather than assume a drop surface exists.
   */
  pocket?(color: PieceColor): Record<PieceType, number>;
  /** Legal drop squares for a pocket piece of the side to move. */
  dropTargets?(type: PieceType): string[];
  /** Play a drop from the pocket. */
  drop?(type: PieceType, to: string): AppliedMove | null;
  /**
   * Canonical three-check counters, read from position state (FEN), never
   * inferred from SAN strings.
   */
  checkCount?(): { w: number; b: number };
  /**
   * Variant-specific terminal state decided by the rules engine itself
   * (king of the hill, racing kings, atomic king explosion, horde wipe-out,
   * giveaway bare side, three-check counters).
   */
  variantOutcome?(): { over: boolean; winner?: PieceColor | "draw"; reason?: string } | null;
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
    promotion?: PromotionPiece,
  ): AppliedMove | null;
}
