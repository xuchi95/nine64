import { Chess } from "chess.js";
import {
  PIECE_VALUE,
  attackersOf,
  indexToSquare,
  parseFen,
  squareToIndex,
  type BoardPiece,
  type Side,
} from "./board";

export type Motif =
  | "fork"
  | "pin"
  | "skewer"
  | "discovered"
  | "back-rank"
  | "hanging"
  | "mate-net"
  | "promotion"
  | "zugzwang";

export const MOTIF_LABEL: Record<Motif, string> = {
  fork: "Fork",
  pin: "Pin",
  skewer: "Skewer",
  discovered: "Discovered attack",
  "back-rank": "Back-rank threat",
  hanging: "Hanging piece",
  "mate-net": "Mating net",
  promotion: "Promotion",
  zugzwang: "Zugzwang",
};

const SLIDER_DIRS: Record<"b" | "r", number[][]> = {
  b: [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ],
  r: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
};

function fileRank(index: number): [number, number] {
  return [index % 8, 7 - Math.floor(index / 8)];
}
function toIndex(file: number, rank: number): number {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
  return (7 - rank) * 8 + file;
}

function dirsFor(type: BoardPiece["type"]): number[][] {
  if (type === "q") return [...SLIDER_DIRS.b, ...SLIDER_DIRS.r];
  if (type === "b") return SLIDER_DIRS.b;
  if (type === "r") return SLIDER_DIRS.r;
  return [];
}

/** Attack targets of the piece standing on `index`. */
function targetsOf(squares: (BoardPiece | null)[], index: number): number[] {
  const piece = squares[index];
  if (!piece) return [];
  const enemy: Side = piece.color === "w" ? "b" : "w";
  const out: number[] = [];
  const [f, r] = fileRank(index);

  if (piece.type === "p") {
    const dir = piece.color === "w" ? 1 : -1;
    for (const df of [-1, 1]) {
      const idx = toIndex(f + df, r + dir);
      if (idx >= 0 && squares[idx]?.color === enemy) out.push(idx);
    }
    return out;
  }
  if (piece.type === "n") {
    for (const [df, dr] of [
      [1, 2],
      [2, 1],
      [2, -1],
      [1, -2],
      [-1, -2],
      [-2, -1],
      [-2, 1],
      [-1, 2],
    ]) {
      const idx = toIndex(f + df!, r + dr!);
      if (idx >= 0 && squares[idx]?.color === enemy) out.push(idx);
    }
    return out;
  }
  if (piece.type === "k") {
    for (let df = -1; df <= 1; df += 1)
      for (let dr = -1; dr <= 1; dr += 1) {
        if (!df && !dr) continue;
        const idx = toIndex(f + df, r + dr);
        if (idx >= 0 && squares[idx]?.color === enemy) out.push(idx);
      }
    return out;
  }
  for (const [df, dr] of dirsFor(piece.type)) {
    let cf = f + df!;
    let cr = r + dr!;
    while (true) {
      const idx = toIndex(cf, cr);
      if (idx < 0) break;
      const occupant = squares[idx];
      if (occupant) {
        if (occupant.color === enemy) out.push(idx);
        break;
      }
      cf += df!;
      cr += dr!;
    }
  }
  return out;
}

/** Pins and skewers created by the slider on `index`. */
function lineTactics(
  squares: (BoardPiece | null)[],
  index: number,
): { motif: "pin" | "skewer"; front: string; back: string }[] {
  const piece = squares[index];
  if (!piece || !"qbr".includes(piece.type)) return [];
  const enemy: Side = piece.color === "w" ? "b" : "w";
  const results: { motif: "pin" | "skewer"; front: string; back: string }[] = [];
  const [f, r] = fileRank(index);
  for (const [df, dr] of dirsFor(piece.type)) {
    let cf = f + df!;
    let cr = r + dr!;
    let first: { idx: number; piece: BoardPiece } | null = null;
    while (true) {
      const idx = toIndex(cf, cr);
      if (idx < 0) break;
      const occupant = squares[idx];
      if (occupant) {
        if (occupant.color !== enemy) break;
        if (!first) {
          first = { idx, piece: occupant };
        } else {
          const frontVal = PIECE_VALUE[first.piece.type];
          const backVal = PIECE_VALUE[occupant.type];
          if (backVal > frontVal) {
            results.push({ motif: "pin", front: indexToSquare(first.idx), back: indexToSquare(idx) });
          } else if (frontVal > backVal) {
            results.push({
              motif: "skewer",
              front: indexToSquare(first.idx),
              back: indexToSquare(idx),
            });
          }
          break;
        }
      }
      cf += df!;
      cr += dr!;
    }
  }
  return results;
}

export interface MotifHit {
  motif: Motif;
  detail: string;
}

export interface MotifInput {
  /** Position before the move. */
  fenBefore: string;
  /** Position after the move. */
  fenAfter: string;
  from: string;
  to: string;
  san: string;
  /** Engine mate distance after the move, mover POV (positive = mating). */
  mateIn?: number | null;
}

/** Tactical motifs created by the move that produced `fenAfter`. */
export function detectMotifs(input: MotifInput): MotifHit[] {
  const hits: MotifHit[] = [];
  const before = parseFen(input.fenBefore);
  const after = parseFen(input.fenAfter);
  const mover: Side = before.turn;
  const enemy: Side = mover === "w" ? "b" : "w";
  const toIdx = squareToIndex(input.to);
  const fromIdx = squareToIndex(input.from);

  if (input.san.includes("=")) hits.push({ motif: "promotion", detail: input.san });

  // Fork: the moved piece attacks two or more valuable enemy pieces.
  const movedTargets = targetsOf(after.squares, toIdx).filter((idx) => {
    const p = after.squares[idx]!;
    const moved = after.squares[toIdx]!;
    return (
      p.type === "k" ||
      PIECE_VALUE[p.type] >= PIECE_VALUE[moved.type] ||
      attackersOf(after.squares, idx, enemy).length === 0
    );
  });
  if (movedTargets.length >= 2) {
    hits.push({
      motif: "fork",
      detail: `${input.to} hits ${movedTargets.map(indexToSquare).join(", ")}`,
    });
  }

  // Pins and skewers newly created by any friendly slider.
  const linesBefore = new Set<string>();
  before.squares.forEach((p, i) => {
    if (p?.color === mover)
      lineTactics(before.squares, i).forEach((t) => linesBefore.add(`${t.motif}:${t.front}:${t.back}`));
  });
  after.squares.forEach((p, i) => {
    if (p?.color !== mover) return;
    for (const t of lineTactics(after.squares, i)) {
      const key = `${t.motif}:${t.front}:${t.back}`;
      if (!linesBefore.has(key)) {
        hits.push({ motif: t.motif, detail: `${t.front} → ${t.back}` });
        // A newly opened line from a piece that did not move is a discovery.
        if (i !== toIdx && i !== fromIdx) hits.push({ motif: "discovered", detail: `${indexToSquare(i)} line opened` });
      }
    }
  });

  // Hanging enemy material after the move.
  const hanging: string[] = [];
  after.squares.forEach((p, i) => {
    if (!p || p.color !== enemy || p.type === "k") return;
    if (
      attackersOf(after.squares, i, mover).length > 0 &&
      attackersOf(after.squares, i, enemy).length === 0
    ) {
      hanging.push(indexToSquare(i));
    }
  });
  if (hanging.length > 0) hits.push({ motif: "hanging", detail: hanging.join(", ") });

  // Back rank: enemy king stuck on its own back rank with pawns in front.
  const kingIdx = after.squares.findIndex((p) => p?.type === "k" && p.color === enemy);
  if (kingIdx >= 0) {
    const rank = 7 - Math.floor(kingIdx / 8);
    const homeRank = enemy === "w" ? 0 : 7;
    if (rank === homeRank) {
      const [kf] = fileRank(kingIdx);
      const shield = [kf - 1, kf, kf + 1]
        .map((f) => toIndex(f, homeRank + (enemy === "w" ? 1 : -1)))
        .filter((i) => i >= 0)
        .filter((i) => after.squares[i]?.type === "p" && after.squares[i]?.color === enemy);
      const heavyOnRank = after.squares.some(
        (p, i) => p?.color === mover && "qr".includes(p.type) && 7 - Math.floor(i / 8) === homeRank,
      );
      if (shield.length >= 2 && heavyOnRank) {
        hits.push({ motif: "back-rank", detail: `king on ${indexToSquare(kingIdx)}` });
      }
    }
  }

  if (typeof input.mateIn === "number" && input.mateIn > 0 && input.mateIn <= 5) {
    hits.push({ motif: "mate-net", detail: `mate in ${input.mateIn}` });
  }

  // Zugzwang proxy: side to move is not in check but every legal move worsens
  // material safety (few legal moves, all leaving pieces hanging).
  try {
    const chess = new Chess(input.fenAfter);
    const legal = chess.moves({ verbose: true });
    if (!chess.inCheck() && legal.length > 0 && legal.length <= 4) {
      const allBad = legal.every((m) => {
        const probe = new Chess(input.fenAfter);
        probe.move({ from: m.from, to: m.to, promotion: "q" });
        const p = parseFen(probe.fen());
        return p.squares.some(
          (piece, i) =>
            piece?.color === enemy &&
            piece.type !== "k" &&
            attackersOf(p.squares, i, mover).length > 0 &&
            attackersOf(p.squares, i, enemy).length === 0,
        );
      });
      if (allBad) hits.push({ motif: "zugzwang", detail: `${legal.length} legal moves, all losing` });
    }
  } catch {
    /* ignore unparsable positions */
  }

  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = `${h.motif}:${h.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
