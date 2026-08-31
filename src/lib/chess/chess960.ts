/**
 * Deterministic Chess960 (Fischer Random) start position generator.
 *
 * Uses the standard Scharnagl numbering scheme (SP-0 .. SP-959) so that any
 * position can be reproduced exactly from its index. The algorithm is pure
 * arithmetic + table lookup: there is no rejection sampling and therefore no
 * loop that can spin forever.
 *
 * Guarantees by construction (see chess960.test.ts, which asserts all 960):
 *  - exactly 1 king, 1 queen, 2 rooks, 2 bishops, 2 knights
 *  - bishops sit on opposite-coloured squares
 *  - the king sits strictly between the two rooks
 *  - white and black share the same (mirrored) back rank
 */

export type Chess960Index = number; // 0..959

export interface Chess960CastlingMetadata {
  /** File index (0 = a) of the king on the back rank. */
  kingFile: number;
  /** File index of the rook that castles kingside (h-side). */
  kingsideRookFile: number;
  /** File index of the rook that castles queenside (a-side). */
  queensideRookFile: number;
  /** X-FEN / standard castling field ("KQkq"). */
  xfen: string;
  /** Shredder-FEN castling field, e.g. "HAha". */
  shredder: string;
}

export interface Chess960Position {
  index: Chess960Index;
  /** X-FEN (castling field "KQkq") — the notation chess engines default to. */
  fen: string;
  /** Shredder-FEN (castling field uses rook files). */
  shredderFen: string;
  /** Lower-case back rank, file a..h, e.g. "bqnbnrkr". */
  backRank: string;
  castlingMetadata: Chess960CastlingMetadata;
}

/** The classical starting array is Scharnagl position 518. */
export const STANDARD_CHESS960_INDEX = 518;
export const CHESS960_POSITION_COUNT = 960;

const FILES = "abcdefgh";

/** KRN placement table for the 10 possible knight pairs (n5 = 0..9). */
const KRN_TABLE = [
  "nnrkr",
  "nrnkr",
  "nrknr",
  "nrkrn",
  "rnnkr",
  "rnknr",
  "rnkrn",
  "rknnr",
  "rknrn",
  "rkrnn",
] as const;

function assertIndex(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= CHESS960_POSITION_COUNT) {
    throw new RangeError(`Chess960 index must be an integer in 0..959, received ${String(index)}`);
  }
  return index;
}

/** Build the lower-case back rank for a Scharnagl index. Pure, O(1). */
export function backRankForIndex(index: Chess960Index): string {
  assertIndex(index);
  const rank: (string | null)[] = Array.from({ length: 8 }, () => null);

  // 1. Light-squared bishop: files b, d, f, h (indices 1,3,5,7).
  const n1 = index % 4;
  const n2 = Math.floor(index / 4);
  rank[1 + n1 * 2] = "b";

  // 2. Dark-squared bishop: files a, c, e, g (indices 0,2,4,6).
  const q1 = n2 % 4;
  const n3 = Math.floor(n2 / 4);
  rank[q1 * 2] = "b";

  // 3. Queen on the (q+1)-th remaining empty square.
  const q = n3 % 6;
  const n5 = Math.floor(n3 / 6); // 0..9
  let seen = -1;
  for (let file = 0; file < 8; file += 1) {
    if (rank[file] !== null) continue;
    seen += 1;
    if (seen === q) {
      rank[file] = "q";
      break;
    }
  }

  // 4. Remaining 5 squares get the knight/rook/king pattern from the table.
  const pattern = KRN_TABLE[n5]!;
  let p = 0;
  for (let file = 0; file < 8; file += 1) {
    if (rank[file] !== null) continue;
    rank[file] = pattern[p]!;
    p += 1;
  }

  return rank.join("");
}

/** Inverse mapping: index of a given back rank, or null when it is not a legal 960 array. */
export function indexForBackRank(backRank: string): Chess960Index | null {
  const normalised = backRank.toLowerCase();
  for (let i = 0; i < CHESS960_POSITION_COUNT; i += 1) {
    if (backRankForIndex(i) === normalised) return i;
  }
  return null;
}

function castlingMetadata(backRank: string): Chess960CastlingMetadata {
  const kingFile = backRank.indexOf("k");
  const queensideRookFile = backRank.indexOf("r");
  const kingsideRookFile = backRank.lastIndexOf("r");
  const upper = (f: number) => FILES[f]!.toUpperCase();
  return {
    kingFile,
    kingsideRookFile,
    queensideRookFile,
    xfen: "KQkq",
    shredder: `${upper(kingsideRookFile)}${upper(queensideRookFile)}${FILES[kingsideRookFile]}${FILES[queensideRookFile]}`,
  };
}

/**
 * Deterministic Chess960 position. Omit `index` for a uniformly random one.
 */
export function generateChess960Position(index?: number): Chess960Position {
  const resolved =
    index === undefined ? Math.floor(Math.random() * CHESS960_POSITION_COUNT) : assertIndex(index);
  const backRank = backRankForIndex(resolved);
  const meta = castlingMetadata(backRank);
  const black = backRank;
  const white = backRank.toUpperCase();
  const body = `${black}/pppppppp/8/8/8/8/PPPPPPPP/${white} w`;
  return {
    index: resolved,
    backRank,
    fen: `${body} ${meta.xfen} - 0 1`,
    shredderFen: `${body} ${meta.shredder} - 0 1`,
    castlingMetadata: meta,
  };
}

/** Convenience: X-FEN string only. */
export function generateChess960Fen(index?: number): string {
  return generateChess960Position(index).fen;
}

/**
 * Structural validation of a Chess960 starting FEN before it becomes the
 * canonical position of a real game. Rejects anything the generator could
 * never have produced: bad piece counts, same-colour bishops, a king outside
 * the rooks, or a castling right that does not point at an actual rook.
 */
export function isValidChess960Start(fen: string): boolean {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) return false;
  const [placement, side, castling] = parts as [string, string, string];
  const ranks = placement.split("/");
  if (ranks.length !== 8) return false;
  if (side !== "w") return false;

  const black = ranks[0] ?? "";
  const white = ranks[7] ?? "";
  if (ranks[1] !== "pppppppp" || ranks[6] !== "PPPPPPPP") return false;
  if (ranks.slice(2, 6).some((r) => r !== "8")) return false;
  if (black.length !== 8 || white.length !== 8) return false;
  if (white.toLowerCase() !== black) return false;
  if (!/^[rnbqk]{8}$/.test(black)) return false;

  const counts: Record<string, number> = {};
  for (const c of black) counts[c] = (counts[c] ?? 0) + 1;
  if (counts["k"] !== 1 || counts["q"] !== 1) return false;
  if (counts["r"] !== 2 || counts["b"] !== 2 || counts["n"] !== 2) return false;

  const bishops = [...black].flatMap((c, i) => (c === "b" ? [i] : []));
  if ((bishops[0]! - bishops[1]!) % 2 === 0) return false;

  const king = black.indexOf("k");
  const rooks = [...black].flatMap((c, i) => (c === "r" ? [i] : []));
  if (!(rooks[0]! < king && king < rooks[1]!)) return false;

  // Every castling right must name a real rook, on both sides.
  if (castling === "-" ) return false;
  const rookFiles = new Set(rooks.map((i) => FILES[i]!));
  for (const right of castling) {
    const lower = right.toLowerCase();
    if (lower === "k" || lower === "q") continue; // X-FEN shorthand
    if (!/^[a-h]$/.test(lower)) return false;
    if (!rookFiles.has(lower)) return false;
  }
  const hasWhite = [...castling].some((c) => c === c.toUpperCase());
  const hasBlack = [...castling].some((c) => c === c.toLowerCase());
  return hasWhite && hasBlack;
}
