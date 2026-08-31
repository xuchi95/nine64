import { Chess, type Move } from "chess.js";
import {
  RulesError,
  type AppliedMove,
  type BoardPiece,
  type ChessRulesAdapter,
  type PieceColor,
  type PieceType,
  type PromotionPiece,
  type RulesPosition,
} from "./ChessRulesAdapter";

export const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function castleMeta(move: Move): AppliedMove["castle"] {
  if (!move.flags.includes("k") && !move.flags.includes("q")) return undefined;
  const rank = move.color === "w" ? "1" : "8";
  const kingside = move.flags.includes("k");
  return {
    side: kingside ? "king" : "queen",
    kingFrom: move.from,
    kingTo: move.to,
    rookFrom: `${kingside ? "h" : "a"}${rank}`,
    rookTo: `${kingside ? "f" : "d"}${rank}`,
  };
}

function toApplied(move: Move, fen: string): AppliedMove {
  return {
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ""}`,
    from: move.from,
    to: move.to,
    color: move.color as PieceColor,
    captured: move.captured as PieceType | undefined,
    promotion: move.promotion as PromotionPiece | undefined,
    fen,
    castle: castleMeta(move),
  };
}

class ChessJsPosition implements RulesPosition {
  private readonly game: Chess;

  constructor(fen: string) {
    this.game = new Chess();
    try {
      this.game.load(fen);
    } catch (error) {
      throw new RulesError("INVALID_FEN", (error as Error).message);
    }
  }

  fen() {
    return this.game.fen();
  }

  turn(): PieceColor {
    return this.game.turn() as PieceColor;
  }

  pieceAt(square: string): BoardPiece | null {
    const piece = this.game.get(square as never);
    if (!piece) return null;
    return { square, type: piece.type as PieceType, color: piece.color as PieceColor };
  }

  boardPieces(): BoardPiece[] {
    return this.game
      .board()
      .flat()
      .filter((sq): sq is NonNullable<typeof sq> => sq !== null)
      .map((sq) => ({
        square: sq.square as string,
        type: sq.type as PieceType,
        color: sq.color as PieceColor,
      }));
  }

  legalTargets(square: string): string[] {
    try {
      return this.game
        .moves({ square: square as never, verbose: true })
        .map((m) => (m as Move).to as string);
    } catch {
      return [];
    }
  }

  legalMoves() {
    return (this.game.moves({ verbose: true }) as Move[]).map((m) => ({
      from: m.from,
      to: m.to,
      san: m.san,
      ...(m.promotion ? { promotion: m.promotion as PromotionPiece } : {}),
    }));
  }

  move(from: string, to: string, promotion?: PromotionPiece): AppliedMove | null {
    try {
      const applied = this.game.move({ from, to, promotion: promotion ?? "q" });
      if (!applied) return null;
      return toApplied(applied, this.game.fen());
    } catch {
      return null;
    }
  }

  historySan(): string[] {
    return this.game.history();
  }

  isCheck() {
    return this.game.isCheck();
  }
  isCheckmate() {
    return this.game.isCheckmate();
  }
  isStalemate() {
    return this.game.isStalemate();
  }
  isInsufficientMaterial() {
    return this.game.isInsufficientMaterial();
  }
  isThreefoldRepetition() {
    return this.game.isThreefoldRepetition();
  }
  isDraw() {
    return this.game.isDraw();
  }
  isGameOver() {
    return this.game.isGameOver();
  }

  needsPromotion(from: string, to: string): boolean {
    const piece = this.pieceAt(from);
    if (!piece || piece.type !== "p") return false;
    return (piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1");
  }

  kingSquare(color: PieceColor): string | null {
    return this.boardPieces().find((p) => p.type === "k" && p.color === color)?.square ?? null;
  }

  clone(): RulesPosition {
    return new ChessJsPosition(this.game.fen());
  }
}

/**
 * Classical FIDE rules, backed by chess.js. This is the only rule engine in
 * the project that is verified against perft reference counts.
 */
export const StandardRules: ChessRulesAdapter = {
  engine: "chessjs-standard",
  supported: true,
  supportsArbitraryCastling: false,
  pgnVariantTag: null,
  startingFen: () => STANDARD_FEN,
  createPosition: (fen = STANDARD_FEN) => new ChessJsPosition(fen),
  validateMove(fen, from, to, promotion) {
    let position: ChessJsPosition;
    try {
      position = new ChessJsPosition(fen);
    } catch {
      return null;
    }
    return position.move(from, to, promotion);
  },
};
