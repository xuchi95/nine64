import { Chess } from "chess.js";
import type { VariantId } from "@/config/variants";
import { generateChess960Position } from "@/lib/chess/chess960";

export interface VariantResult {
  over: boolean;
  winner?: "w" | "b";
  reason?: string;
}

export interface VariantRules {
  id: VariantId;
  /** Starting FEN for a new game. */
  startingFen: () => string;
  /**
   * Variant-specific terminal check, evaluated after each move.
   * Standard rules (mate/stalemate/etc.) are always checked separately.
   */
  checkResult: (game: Chess, history: string[]) => VariantResult;
  /** Chess960-style castling handling required. */
  chess960: boolean;
}

const NONE: VariantResult = { over: false };

const STANDARD_BACK = "rnbqkbnr";

export const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";


function countChecks(history: string[]): { w: number; b: number } {
  let w = 0;
  let b = 0;
  history.forEach((san, i) => {
    if (san.includes("+") || san.includes("#")) {
      if (i % 2 === 0) w += 1;
      else b += 1;
    }
  });
  return { w, b };
}

const CENTER = new Set(["d4", "e4", "d5", "e5"]);

export const VARIANT_RULES: Record<VariantId, VariantRules> = {
  standard: {
    id: "standard",
    startingFen: () => STANDARD_FEN,
    checkResult: () => NONE,
    chess960: false,
  },
  chess960: {
    id: "chess960",
    // Position generation is deterministic and correct; the variant stays
    // disabled in the capability registry because castling is not implemented.
    startingFen: () => generateChess960Position().fen,
    checkResult: () => NONE,
    chess960: true,
  },

  "three-check": {
    id: "three-check",
    startingFen: () => STANDARD_FEN,
    checkResult: (_game, history) => {
      const { w, b } = countChecks(history);
      if (w >= 3) return { over: true, winner: "w", reason: "Three checks delivered" };
      if (b >= 3) return { over: true, winner: "b", reason: "Three checks delivered" };
      return NONE;
    },
    chess960: false,
  },
  "king-of-the-hill": {
    id: "king-of-the-hill",
    startingFen: () => STANDARD_FEN,
    checkResult: (game) => {
      const board = game.board();
      for (const row of board) {
        for (const sq of row) {
          if (sq && sq.type === "k" && CENTER.has(sq.square)) {
            return { over: true, winner: sq.color, reason: "King reached the hill" };
          }
        }
      }
      return NONE;
    },
    chess960: false,
  },
  "no-queen": {
    id: "no-queen",
    startingFen: () => "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1",
    checkResult: () => NONE,
    chess960: false,
  },
  "random-army": {
    id: "random-army",
    // Same shuffled back rank family as Chess960 — disabled for the same reason.
    startingFen: () => generateChess960Position().fen,
    checkResult: () => NONE,
    chess960: true,
  },

};

export function newGameForVariant(variant: VariantId): Chess {
  const rules = VARIANT_RULES[variant];
  const fen = rules.startingFen();
  const game = new Chess();
  game.load(fen, { skipValidation: false });
  return game;
}

export { STANDARD_BACK };
