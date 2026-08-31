import { Chess } from "chess.js";
import {
  RulesError,
  type AppliedMove,
  type ChessRulesAdapter,
  type RulesPosition,
} from "./ChessRulesAdapter";

export const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function toApplied(move: ReturnType<Chess["move"]>, fen: string): AppliedMove {
  return {
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ""}`,
    from: move.from,
    to: move.to,
    color: move.color,
    captured: move.captured,
    promotion: move.promotion,
    fen,
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

  turn() {
    return this.game.turn() as "w" | "b";
  }

  legalTargets(square: string): string[] {
    try {
      return this.game.moves({ square: square as never, verbose: true }).map((m) => m.to as string);
    } catch {
      return [];
    }
  }

  move(from: string, to: string, promotion?: "q" | "r" | "b" | "n"): AppliedMove | null {
    try {
      const applied = this.game.move({ from, to, promotion: promotion ?? "q" });
      if (!applied) return null;
      return toApplied(applied, this.game.fen());
    } catch {
      return null;
    }
  }

  isCheck() {
    return this.game.isCheck();
  }

  isGameOver() {
    return this.game.isGameOver();
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
