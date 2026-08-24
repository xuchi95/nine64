import { Chess } from "chess.js";

/** A suggested engine variation for a position, rendered in SAN. */
export interface Variation {
  /** Engine move in UCI notation. */
  uci: string;
  /** Engine move in SAN notation. */
  san: string;
  /** Principal variation in SAN, starting with `san`. */
  pvSan: string[];
  /** Centipawns from the perspective of the side to move. */
  cp: number | null;
  mateIn: number | null;
  depth: number;
}

/** Convert a UCI principal variation into SAN moves playable from `fen`. */
export function pvToSan(fen: string, pv: string[], maxPlies = 8): string[] {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const uci of pv.slice(0, maxPlies)) {
    if (!uci || uci.length < 4) break;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    try {
      const move = chess.move(promotion ? { from, to, promotion } : { from, to });

      if (!move) break;
      out.push(move.san);
    } catch {
      break;
    }
  }
  return out;
}

/** Move number label for a ply index (0-based). */
export function plyLabel(index: number): string {
  const moveNo = Math.floor(index / 2) + 1;
  return index % 2 === 0 ? `${moveNo}.` : `${moveNo}...`;
}
