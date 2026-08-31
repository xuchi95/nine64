import { Chess960 } from "void57-chess";
import { generateChess960Position } from "@/lib/chess/chess960";
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
import { castleFinalSquares, castlingRookSquares, normaliseCastleIntent } from "./chess960MoveCodec";

/**
 * Chess960 rules, backed by `void57-chess` (native Chess960 support: arbitrary
 * king/rook files, both castling directions, king/rook already on their
 * destination squares, crossing king and rook, attacked-square legality,
 * castling-right removal, X-FEN/Shredder castling fields).
 *
 * chess.js is deliberately NOT used on any Chess960 path.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Lib960 = any;

/**
 * Canonical Chess960 FEN. The generator hands us a Shredder-FEN
 * (rook-file castling rights); the rule engine re-writes it as X-FEN, keeping
 * the exact rook associated with every right. Round-tripping through the rule
 * engine — never through chess.js — is what makes the FEN canonical.
 */
export function canonicalChess960Fen(fen: string): string {
  try {
    return (new Chess960(fen) as Lib960).fen();
  } catch (error) {
    throw new RulesError("CHESS960_INVALID_FEN", (error as Error).message, { fen });
  }
}

function castleMeta(
  beforeFen: string,
  move: { color: string; from: string; to: string; flags: string },
): AppliedMove["castle"] {
  const kingside = move.flags.includes("k");
  const queenside = move.flags.includes("q");
  if (!kingside && !queenside) return undefined;
  const color = move.color === "w" ? "w" : "b";
  const side = kingside ? "king" : "queen";
  const rights = castlingRookSquares(beforeFen)[color];
  const rookFrom = (kingside ? rights.king : rights.queen) ?? null;
  const finals = castleFinalSquares(color, side);
  if (!rookFrom) {
    throw new RulesError("CHESS960_ILLEGAL_CASTLE", "castling right has no matching rook", {
      fen: beforeFen,
      from: move.from,
      to: move.to,
    });
  }
  return {
    side,
    kingFrom: move.from,
    kingTo: finals.king,
    rookFrom,
    rookTo: finals.rook,
  };
}

class Chess960Position implements RulesPosition {
  private readonly game: Lib960;

  constructor(fen: string) {
    try {
      this.game = new Chess960(fen);
    } catch (error) {
      throw new RulesError("CHESS960_INVALID_FEN", (error as Error).message, { fen });
    }
  }

  fen(): string {
    return this.game.fen();
  }

  turn(): PieceColor {
    return this.game.turn() === "b" ? "b" : "w";
  }

  pieceAt(square: string): BoardPiece | null {
    const piece = this.game.get(square);
    if (!piece) return null;
    return { square, type: piece.type as PieceType, color: piece.color as PieceColor };
  }

  boardPieces(): BoardPiece[] {
    return (this.game.board() as ({ square: string; type: string; color: string } | null)[][])
      .flat()
      .filter((sq): sq is { square: string; type: string; color: string } => sq !== null)
      .map((sq) => ({
        square: sq.square,
        type: sq.type as PieceType,
        color: sq.color as PieceColor,
      }));
  }

  legalTargets(square: string): string[] {
    try {
      const moves = this.game.moves({ square, verbose: true }) as {
        to: string;
        san: string;
        color: string;
      }[];
      // Castles come back as king -> final king square already; keep that and
      // deduplicate so a castle onto the king's own square stays offered.
      return [...new Set(moves.map((m) => m.to))];
    } catch {
      return [];
    }
  }

  legalMoves() {
    const moves = this.game.moves({ verbose: true }) as {
      from: string;
      to: string;
      san: string;
      promotion?: string;
    }[];
    return moves.map((m) => ({
      from: m.from,
      to: m.to,
      san: m.san,
      ...(m.promotion ? { promotion: m.promotion as PromotionPiece } : {}),
    }));
  }

  move(from: string, to: string, promotion?: PromotionPiece): AppliedMove | null {
    const beforeFen = this.game.fen();
    const intent = normaliseCastleIntent(beforeFen, from, to);
    let applied: {
      san: string;
      from: string;
      to: string;
      color: string;
      captured?: string;
      promotion?: string;
      flags: string;
    } | null = null;
    try {
      applied = this.game.move({
        from: intent.from,
        to: intent.to,
        ...(promotion ? { promotion } : {}),
      });
    } catch {
      applied = null;
    }
    if (!applied) {
      // Promotion default: the board may not have asked for a piece yet.
      if (!promotion) {
        try {
          applied = this.game.move({ from: intent.from, to: intent.to, promotion: "q" });
        } catch {
          applied = null;
        }
      }
      if (!applied) return null;
    }

    const castle = castleMeta(beforeFen, applied);
    const canonicalTo = castle ? castle.kingTo : applied.to;
    return {
      san: applied.san,
      uci: `${applied.from}${canonicalTo}${applied.promotion ?? ""}`,
      from: applied.from,
      to: canonicalTo,
      color: applied.color === "b" ? "b" : "w",
      captured: applied.captured as PieceType | undefined,
      promotion: applied.promotion as PromotionPiece | undefined,
      fen: this.game.fen(),
      castle,
    };
  }

  historySan(): string[] {
    return this.game.history() as string[];
  }

  isCheck(): boolean {
    return this.game.inCheck();
  }
  isCheckmate(): boolean {
    return this.game.isCheckmate();
  }
  isStalemate(): boolean {
    return this.game.isStalemate();
  }
  isInsufficientMaterial(): boolean {
    return this.game.isInsufficientMaterial();
  }
  isThreefoldRepetition(): boolean {
    return this.game.isThreefoldRepetition();
  }
  isDraw(): boolean {
    return this.game.isDraw();
  }
  isGameOver(): boolean {
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
    return new Chess960Position(this.game.fen());
  }
}

export const Chess960Rules: ChessRulesAdapter = {
  engine: "void57-chess960",
  supported: true,
  supportsArbitraryCastling: true,
  pgnVariantTag: "Chess960",
  startingFen: () => canonicalChess960Fen(generateChess960Position().shredderFen),
  createPosition: (fen?: string) =>
    new Chess960Position(fen ?? canonicalChess960Fen(generateChess960Position().shredderFen)),
  validateMove(fen, from, to, promotion) {
    let position: Chess960Position;
    try {
      position = new Chess960Position(fen);
    } catch {
      return null;
    }
    return position.move(from, to, promotion);
  },
};
