/**
 * Geometry helpers that explain *why* a king is in check: which enemy pieces
 * attack the king square, and (for sliders) the squares along the attack ray.
 *
 * Works purely from the piece list already rendered on the board, so it needs
 * no extra rules-engine call and stays in sync with the visible position.
 */

export type BoardPiece = { square: string; type: string; color: "w" | "b" };

export type CheckAttack = {
  /** square of the piece giving check */
  from: string;
  /** king square */
  to: string;
  /** squares strictly between attacker and king (empty for knights/pawns) */
  ray: string[];
};

const FILES = "abcdefgh";

function coords(square: string): [number, number] | null {
  const f = FILES.indexOf(square[0]!);
  const r = Number(square[1]) - 1;
  if (f < 0 || Number.isNaN(r) || r < 0 || r > 7) return null;
  return [f, r];
}

function nameOf(f: number, r: number) {
  return `${FILES[f]}${r + 1}`;
}

/** All enemy pieces currently attacking `kingSquare`, with their attack rays. */
export function findCheckAttacks(
  pieces: BoardPiece[],
  kingSquare: string | null | undefined,
): CheckAttack[] {
  if (!kingSquare) return [];
  const king = coords(kingSquare);
  if (!king) return [];
  const [kf, kr] = king;

  const kingPiece = pieces.find((p) => p.square === kingSquare);
  if (!kingPiece) return [];
  const enemy = kingPiece.color === "w" ? "b" : "w";

  const occupied = new Map<string, BoardPiece>();
  for (const p of pieces) occupied.set(p.square, p);

  const attacks: CheckAttack[] = [];

  // --- sliding attackers: walk outward from the king along 8 directions ---
  const dirs: Array<[number, number, "line" | "diag"]> = [
    [1, 0, "line"],
    [-1, 0, "line"],
    [0, 1, "line"],
    [0, -1, "line"],
    [1, 1, "diag"],
    [1, -1, "diag"],
    [-1, 1, "diag"],
    [-1, -1, "diag"],
  ];

  for (const [df, dr, kind] of dirs) {
    const ray: string[] = [];
    let f = kf + df;
    let r = kr + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const sq = nameOf(f, r);
      const piece = occupied.get(sq);
      if (piece) {
        if (piece.color === enemy) {
          const t = piece.type.toLowerCase();
          const slides = kind === "line" ? t === "r" || t === "q" : t === "b" || t === "q";
          if (slides) attacks.push({ from: sq, to: kingSquare, ray: [...ray] });
        }
        break;
      }
      ray.push(sq);
      f += df;
      r += dr;
    }
  }

  // --- knights ---
  const knightJumps = [
    [1, 2],
    [2, 1],
    [2, -1],
    [1, -2],
    [-1, -2],
    [-2, -1],
    [-2, 1],
    [-1, 2],
  ];
  for (const [df, dr] of knightJumps) {
    const f = kf + df!;
    const r = kr + dr!;
    if (f < 0 || f > 7 || r < 0 || r > 7) continue;
    const piece = occupied.get(nameOf(f, r));
    if (piece && piece.color === enemy && piece.type.toLowerCase() === "n") {
      attacks.push({ from: nameOf(f, r), to: kingSquare, ray: [] });
    }
  }

  // --- pawns (enemy pawns capture toward the king) ---
  const pawnDir = enemy === "w" ? -1 : 1; // where the attacking pawn sits, seen from the king
  for (const df of [-1, 1]) {
    const f = kf + df;
    const r = kr + pawnDir;
    if (f < 0 || f > 7 || r < 0 || r > 7) continue;
    const piece = occupied.get(nameOf(f, r));
    if (piece && piece.color === enemy && piece.type.toLowerCase() === "p") {
      attacks.push({ from: nameOf(f, r), to: kingSquare, ray: [] });
    }
  }

  return attacks;
}

/**
 * Squares strictly between two aligned squares (rank, file or diagonal).
 * Returns an empty array when the squares are not aligned (knight hops, etc.).
 */
export function squaresBetween(from: string, to: string): string[] {
  const a = coords(from);
  const b = coords(to);
  if (!a || !b) return [];
  const [af, ar] = a;
  const [bf, br] = b;
  const df = bf - af;
  const dr = br - ar;
  const aligned = df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr);
  if (!aligned || (df === 0 && dr === 0)) return [];
  const sf = Math.sign(df);
  const sr = Math.sign(dr);
  const steps = Math.max(Math.abs(df), Math.abs(dr));
  const out: string[] = [];
  for (let i = 1; i < steps; i++) out.push(nameOf(af + sf * i, ar + sr * i));
  return out;
}
