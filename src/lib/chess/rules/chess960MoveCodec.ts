/**
 * Chess960 notation boundary.
 *
 * Nine64 has exactly TWO coordinate notations and this file is the only place
 * that converts between them:
 *
 *   1. Application notation (everything inside Nine64: UI, database
 *      `game_moves.uci`, share links, replay, animations).
 *      A castle is  KING START -> KING FINAL SQUARE  (e1g1 / e1c1), even when
 *      the king does not move (king already on g1 → "g1g1").
 *
 *   2. Stockfish notation with `UCI_Chess960 = true`.
 *      A castle is  KING START -> CASTLING ROOK SQUARE  (e1h1 / e1a1), with
 *      the rook file taken from the position's castling rights, never assumed
 *      to be a/h.
 *
 * Promotions keep the ordinary UCI suffix in both notations.
 */

import type { CastleSide, PromotionPiece } from "./ChessRulesAdapter";

const FILES = "abcdefgh";

export interface CastlingRookSquares {
  /** Rook that castles toward the h-side (short castle), or null. */
  king: string | null;
  /** Rook that castles toward the a-side (long castle), or null. */
  queen: string | null;
}

export interface Chess960FenInfo {
  board: Map<string, { type: string; color: "w" | "b" }>;
  turn: "w" | "b";
  castling: { w: CastlingRookSquares; b: CastlingRookSquares };
  kings: { w: string | null; b: string | null };
}

export function parseBoard(fen: string): Chess960FenInfo["board"] {
  const board = new Map<string, { type: string; color: "w" | "b" }>();
  const rows = (fen.split(" ")[0] ?? "").split("/");
  rows.forEach((row, rowIndex) => {
    const rank = 8 - rowIndex;
    let file = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const square = `${FILES[file]}${rank}`;
      board.set(square, {
        type: ch.toLowerCase(),
        color: ch === ch.toUpperCase() ? "w" : "b",
      });
      file += 1;
    }
  });
  return board;
}

/**
 * Resolve the castling rights field (X-FEN "KQkq" or Shredder "AHah", or a
 * mix) to the concrete rook squares it refers to, using the actual board.
 */
export function castlingRookSquares(fen: string): Chess960FenInfo["castling"] {
  const board = parseBoard(fen);
  const field = fen.split(" ")[2] ?? "-";
  const out: Chess960FenInfo["castling"] = {
    w: { king: null, queen: null },
    b: { king: null, queen: null },
  };
  if (field === "-") return out;

  const kingFile = (color: "w" | "b"): number | null => {
    const rank = color === "w" ? "1" : "8";
    for (let f = 0; f < 8; f += 1) {
      const piece = board.get(`${FILES[f]}${rank}`);
      if (piece && piece.type === "k" && piece.color === color) return f;
    }
    return null;
  };

  for (const ch of field) {
    const color: "w" | "b" = ch === ch.toUpperCase() ? "w" : "b";
    const rank = color === "w" ? "1" : "8";
    const lower = ch.toLowerCase();
    const kf = kingFile(color);
    if (kf === null) continue;

    const rookOn = (f: number) => {
      const piece = board.get(`${FILES[f]}${rank}`);
      return piece && piece.type === "r" && piece.color === color;
    };

    if (lower === "k") {
      for (let f = 7; f > kf; f -= 1) {
        if (rookOn(f)) {
          out[color].king = `${FILES[f]}${rank}`;
          break;
        }
      }
    } else if (lower === "q") {
      for (let f = 0; f < kf; f += 1) {
        if (rookOn(f)) {
          out[color].queen = `${FILES[f]}${rank}`;
          break;
        }
      }
    } else {
      const f = FILES.indexOf(lower);
      if (f < 0 || !rookOn(f)) continue;
      if (f > kf) out[color].king = `${FILES[f]}${rank}`;
      else out[color].queen = `${FILES[f]}${rank}`;
    }
  }
  return out;
}

export function castleFinalSquares(
  color: "w" | "b",
  side: CastleSide,
): { king: string; rook: string } {
  const rank = color === "w" ? "1" : "8";
  return side === "king"
    ? { king: `g${rank}`, rook: `f${rank}` }
    : { king: `c${rank}`, rook: `d${rank}` };
}

/** Which side a castle belongs to, given the rook square and the king square. */
export function castleSide(kingSquare: string, rookSquare: string): CastleSide {
  return FILES.indexOf(rookSquare[0]!) > FILES.indexOf(kingSquare[0]!) ? "king" : "queen";
}

/**
 * Is this APPLICATION move a Chess960 castle in the given position?
 * Returns the rook square when it is, null otherwise.
 */
export function isChess960Castle(
  fen: string,
  from: string,
  to: string,
): { side: CastleSide; rookFrom: string } | null {
  const board = parseBoard(fen);
  const piece = board.get(from);
  if (!piece || piece.type !== "k") return null;
  const rights = castlingRookSquares(fen)[piece.color];

  // Direct app notation: king -> its final castling square (g/c file).
  const rank = piece.color === "w" ? "1" : "8";
  if (to === `g${rank}` && rights.king) return { side: "king", rookFrom: rights.king };
  if (to === `c${rank}` && rights.queen) return { side: "queen", rookFrom: rights.queen };

  // Compatibility: king dropped onto its own castling rook.
  if (rights.king && to === rights.king) return { side: "king", rookFrom: rights.king };
  if (rights.queen && to === rights.queen) return { side: "queen", rookFrom: rights.queen };
  return null;
}

/**
 * Normalise a user gesture (king dropped on its own rook) into the canonical
 * application castle move (king -> g/c).
 */
export function normaliseCastleIntent(
  fen: string,
  from: string,
  to: string,
): { from: string; to: string } {
  const board = parseBoard(fen);
  const piece = board.get(from);
  if (!piece || piece.type !== "k") return { from, to };
  const rights = castlingRookSquares(fen)[piece.color];
  if (rights.king && to === rights.king) {
    return { from, to: castleFinalSquares(piece.color, "king").king };
  }
  if (rights.queen && to === rights.queen) {
    return { from, to: castleFinalSquares(piece.color, "queen").king };
  }
  return { from, to };
}

/** Application move -> Stockfish `UCI_Chess960` move. */
export function appMoveToEngineUci(
  fen: string,
  move: { from: string; to: string; promotion?: string | undefined },
): string {
  const castle = isChess960Castle(fen, move.from, move.to);
  if (castle) return `${move.from}${castle.rookFrom}`;
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

/** Stockfish `UCI_Chess960` move -> application move. Null when undecodable. */
export function engineUciToAppMove(
  fen: string,
  uci: string,
): { from: string; to: string; promotion?: PromotionPiece } | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? (uci[4] as PromotionPiece) : undefined;

  const board = parseBoard(fen);
  const piece = board.get(from);
  if (piece && piece.type === "k") {
    const rights = castlingRookSquares(fen)[piece.color];
    // King-takes-own-rook encoding.
    if (rights.king && to === rights.king) {
      return { from, to: castleFinalSquares(piece.color, "king").king };
    }
    if (rights.queen && to === rights.queen) {
      return { from, to: castleFinalSquares(piece.color, "queen").king };
    }
  }
  return promotion ? { from, to, promotion } : { from, to };
}
