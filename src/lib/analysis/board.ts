/** Minimal FEN board utilities used by SEE, motif detection and phase scoring. */

export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type Side = "w" | "b";
export interface BoardPiece {
  type: PieceType;
  color: Side;
}

export const PIECE_VALUE: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

const FILES = "abcdefgh";

export function squareToIndex(square: string): number {
  const file = FILES.indexOf(square[0]!);
  const rank = Number(square[1]);
  if (file < 0 || !rank) return -1;
  return (8 - rank) * 8 + file;
}

export function indexToSquare(index: number): string {
  return `${FILES[index % 8]}${8 - Math.floor(index / 8)}`;
}

export interface ParsedBoard {
  squares: (BoardPiece | null)[];
  turn: Side;
}

export function parseFen(fen: string): ParsedBoard {
  const [placement = "", turn = "w"] = fen.split(" ");
  const squares: (BoardPiece | null)[] = Array.from({ length: 64 }, () => null);
  let index = 0;
  for (const ch of placement) {
    if (ch === "/") continue;
    if (ch >= "1" && ch <= "8") {
      index += Number(ch);
      continue;
    }
    const lower = ch.toLowerCase() as PieceType;
    if ("pnbrqk".includes(lower) && index < 64) {
      squares[index] = { type: lower, color: ch === lower ? "b" : "w" };
    }
    index += 1;
  }
  return { squares, turn: turn === "b" ? "b" : "w" };
}

const KNIGHT_DELTAS = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
const BISHOP_DIRS = [
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
];
const ROOK_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function fileRank(index: number): [number, number] {
  return [index % 8, 7 - Math.floor(index / 8)];
}

function toIndex(file: number, rank: number): number {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
  return (7 - rank) * 8 + file;
}

/** All indices holding a `color` piece that attacks `target`. */
export function attackersOf(
  squares: (BoardPiece | null)[],
  target: number,
  color: Side,
): number[] {
  const out: number[] = [];
  const [tf, tr] = fileRank(target);

  // Pawns
  const dir = color === "w" ? -1 : 1;
  for (const df of [-1, 1]) {
    const idx = toIndex(tf + df, tr + dir);
    const p = idx >= 0 ? squares[idx] : null;
    if (p && p.color === color && p.type === "p") out.push(idx);
  }

  // Knights
  for (const [df, dr] of KNIGHT_DELTAS) {
    const idx = toIndex(tf + df!, tr + dr!);
    const p = idx >= 0 ? squares[idx] : null;
    if (p && p.color === color && p.type === "n") out.push(idx);
  }

  // King
  for (let df = -1; df <= 1; df += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      if (df === 0 && dr === 0) continue;
      const idx = toIndex(tf + df, tr + dr);
      const p = idx >= 0 ? squares[idx] : null;
      if (p && p.color === color && p.type === "k") out.push(idx);
    }
  }

  // Sliders
  const slide = (dirs: number[][], types: PieceType[]) => {
    for (const [df, dr] of dirs) {
      let f = tf + df!;
      let r = tr + dr!;
      while (true) {
        const idx = toIndex(f, r);
        if (idx < 0) break;
        const p = squares[idx];
        if (p) {
          if (p.color === color && types.includes(p.type)) out.push(idx);
          break;
        }
        f += df!;
        r += dr!;
      }
    }
  };
  slide(BISHOP_DIRS, ["b", "q"]);
  slide(ROOK_DIRS, ["r", "q"]);

  return out;
}

/** Sum of non-pawn, non-king material — used for game-phase detection. */
export function phaseMaterial(squares: (BoardPiece | null)[]): number {
  let total = 0;
  for (const p of squares) {
    if (!p || p.type === "p" || p.type === "k") continue;
    total += PIECE_VALUE[p.type];
  }
  return total;
}
