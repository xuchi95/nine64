/**
 * Variant rule factory for the play-engine service.
 *
 * Standard chess keeps chess.js. Chess960 uses `void57-chess`, which supports
 * arbitrary king/rook files and both castling directions — chess.js cannot
 * validate a Chess960 castle and must never be used on that path.
 *
 * The service also owns the Stockfish notation boundary: with
 * `UCI_Chess960 = true` Stockfish encodes a castle as "king takes rook"
 * (e1h1), while the rules library and Nine64 use "king to its final square"
 * (e1g1).
 */
import { Chess } from "chess.js";
import { Chess960 } from "void57-chess";

export const VARIANTS = new Set(["standard", "chess960"]);

export function createPosition(variant, fen) {
  return variant === "chess960" ? new Chess960(fen) : new Chess(fen);
}

const FILES = "abcdefgh";

/** Rook squares behind each castling right, read from the canonical FEN. */
function castlingRooks(fen) {
  const [placement, , castling] = fen.trim().split(/\s+/);
  const ranks = placement.split("/");
  const out = { w: { king: null, queen: null }, b: { king: null, queen: null } };
  if (!castling || castling === "-") return out;

  const rankFor = (color) => (color === "w" ? ranks[7] : ranks[0]);
  const rookFiles = (color) => {
    const files = [];
    let file = 0;
    for (const ch of rankFor(color) ?? "") {
      if (/\d/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const isWhite = ch === ch.toUpperCase();
      if (ch.toLowerCase() === "r" && (color === "w") === isWhite) files.push(file);
      file += 1;
    }
    return files;
  };
  const kingFile = (color) => {
    let file = 0;
    for (const ch of rankFor(color) ?? "") {
      if (/\d/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const isWhite = ch === ch.toUpperCase();
      if (ch.toLowerCase() === "k" && (color === "w") === isWhite) return file;
      file += 1;
    }
    return -1;
  };

  for (const right of castling) {
    const color = right === right.toUpperCase() ? "w" : "b";
    const rank = color === "w" ? "1" : "8";
    const lower = right.toLowerCase();
    const rooks = rookFiles(color);
    const king = kingFile(color);
    if (lower === "k") {
      const f = rooks.filter((r) => r > king).pop();
      if (f !== undefined) out[color].king = `${FILES[f]}${rank}`;
    } else if (lower === "q") {
      const f = rooks.filter((r) => r < king).shift();
      if (f !== undefined) out[color].queen = `${FILES[f]}${rank}`;
    } else {
      const f = FILES.indexOf(lower);
      if (f >= 0) out[color][f > king ? "king" : "queen"] = `${FILES[f]}${rank}`;
    }
  }
  return out;
}

/**
 * Stockfish (UCI_Chess960) -> rules/app notation. Standard passes through.
 * Returns null when a Chess960 castle cannot be decoded.
 */
export function decodeEngineMove(variant, fen, uci) {
  if (typeof uci !== "string" || uci.length < 4) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;
  if (variant !== "chess960") return { from, to, promotion };

  const position = new Chess960(fen);
  const piece = position.get(from);
  if (!piece || piece.type !== "k") return { from, to, promotion };

  const target = position.get(to);
  const isOwnRook = target && target.type === "r" && target.color === piece.color;
  if (!isOwnRook) return { from, to, promotion };

  const rank = piece.color === "w" ? "1" : "8";
  const rooks = castlingRooks(fen)[piece.color];
  if (to === rooks.king) return { from, to: `g${rank}` };
  if (to === rooks.queen) return { from, to: `c${rank}` };
  return null;
}

/** True when the (from,to) move is legal in `position`. */
export function isLegal(position, move) {
  return position
    .moves({ verbose: true })
    .some(
      (m) =>
        m.from === move.from &&
        m.to === move.to &&
        (move.promotion ? m.promotion === move.promotion : true),
    );
}
