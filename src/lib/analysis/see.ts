import {
  PIECE_VALUE,
  attackersOf,
  parseFen,
  squareToIndex,
  type BoardPiece,
  type Side,
} from "./board";

/**
 * Static Exchange Evaluation: material outcome of the capture sequence on
 * `to` when the piece on `from` initiates it. Positive = good for the mover.
 */
export function see(fen: string, from: string, to: string): number {
  const { squares } = parseFen(fen);
  const fromIdx = squareToIndex(from);
  const toIdx = squareToIndex(to);
  const attacker = squares[fromIdx];
  if (!attacker || fromIdx < 0 || toIdx < 0) return 0;

  const board = squares.slice();
  const target = board[toIdx];
  const gain: number[] = [target ? PIECE_VALUE[target.type] : 0];

  let side: Side = attacker.color === "w" ? "b" : "w";
  let onSquare: BoardPiece = attacker;
  board[toIdx] = attacker;
  board[fromIdx] = null;

  let depth = 0;
  while (depth < 31) {
    const attackers = attackersOf(board, toIdx, side);
    if (attackers.length === 0) break;
    // Least valuable attacker first.
    let bestIdx = attackers[0]!;
    for (const idx of attackers) {
      if (PIECE_VALUE[board[idx]!.type] < PIECE_VALUE[board[bestIdx]!.type]) bestIdx = idx;
    }
    depth += 1;
    gain[depth] = PIECE_VALUE[onSquare.type] - gain[depth - 1]!;
    onSquare = board[bestIdx]!;
    board[toIdx] = onSquare;
    board[bestIdx] = null;
    side = side === "w" ? "b" : "w";
    // Prune: the side to move can always stand pat.
    if (Math.max(-gain[depth - 1]!, gain[depth]!) < 0) break;
  }

  for (let i = depth; i > 0; i -= 1) {
    gain[i - 1] = -Math.max(-gain[i - 1]!, gain[i]!);
  }
  return gain[0]!;
}

/** True when the move gives away material by static exchange (a real sacrifice). */
export function isSacrifice(fen: string, from: string, to: string): boolean {
  return see(fen, from, to) <= -110;
}
