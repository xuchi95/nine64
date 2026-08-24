import { Chess } from "chess.js";
import type { VariantId } from "@/config/variants";

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

function shuffle960(): string {
  // Generate a valid Chess960 back rank: bishops on opposite colors,
  // king between the rooks.
  const slots: (string | null)[] = Array(8).fill(null);
  const empties = () => slots.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
  const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

  const lightSquares = [1, 3, 5, 7];
  const darkSquares = [0, 2, 4, 6];
  const put = (i: number, p: string) => {
    slots[i] = p;
  };
  put(rand(lightSquares)!, "b");
  put(rand(darkSquares)!, "b");
  put(rand(empties())!, "q");
  put(rand(empties())!, "n");
  put(rand(empties())!, "n");
  const rest = empties();
  put(rest[0]!, "r");
  put(rest[1]!, "k");
  put(rest[2]!, "r");
  return slots.join("");
}

function backRankFen(black: string, white: string): string {
  return `${black}/pppppppp/8/8/8/8/PPPPPPPP/${white.toUpperCase()} w KQkq - 0 1`;
}

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
    startingFen: () => {
      const rank = shuffle960();
      return backRankFen(rank, rank);
    },
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
    startingFen: () => {
      // Balanced random: shuffle the standard piece multiset, keep the king
      // between the rooks so castling stays legal, mirrored for both sides.
      const rank = shuffle960();
      return backRankFen(rank, rank);
    },
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
