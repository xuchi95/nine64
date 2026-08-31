import type { VariantId } from "@/config/variants";
import { generateChess960Position } from "@/lib/chess/chess960";
import { Chess960Rules } from "@/lib/chess/rules/Chess960Rules";
import type { BoardPiece } from "@/lib/chess/rules/ChessRulesAdapter";

export interface VariantResult {
  over: boolean;
  winner?: "w" | "b";
  reason?: string;
}

/** Minimal, rule-engine-neutral view a variant objective needs. */
export interface VariantPositionView {
  boardPieces(): BoardPiece[];
}

export interface VariantRules {
  id: VariantId;
  /** Starting FEN for a new game. */
  startingFen: () => string;
  /**
   * Variant-specific terminal check, evaluated after each move.
   * Standard rules (mate/stalemate/etc.) are always checked separately.
   */
  checkResult: (position: VariantPositionView, history: string[]) => VariantResult;
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
    /** Canonical Chess960 start: Scharnagl generator -> rule-engine FEN. */
    startingFen: () => Chess960Rules.startingFen(),
    checkResult: () => NONE,
    chess960: true,
  },

  "three-check": {
    id: "three-check",
    startingFen: () => STANDARD_FEN,
    checkResult: (_position, history) => {
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
    checkResult: (position) => {
      for (const piece of position.boardPieces()) {
        if (piece.type === "k" && CENTER.has(piece.square)) {
          return { over: true, winner: piece.color, reason: "King reached the hill" };
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
    // Random Army stays DISABLED in the capability registry: its balancing
    // rules are unspecified. It is not "Chess960 with another name".
    startingFen: () => generateChess960Position().shredderFen,
    checkResult: () => NONE,
    chess960: true,
  },
};

export { STANDARD_BACK };
