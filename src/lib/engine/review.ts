import { Chess } from "chess.js";
import { StockfishEngine, type PerformanceMode } from "@/lib/engine/stockfish";
import { computeAccuracy, type GameReview } from "@/lib/history";
import type { MoveRecord } from "@/hooks/useChessGame";

const MATE_CP = 1200;

/** Convert a side-to-move score into a white-POV centipawn value. */
function toWhitePov(fen: string, cp: number | null, mateIn: number | null): number | null {
  const blackToMove = fen.split(" ")[1] === "b";
  let value: number | null;
  if (mateIn !== null) value = mateIn > 0 ? MATE_CP : -MATE_CP;
  else value = cp;
  if (value === null) return null;
  return blackToMove ? -value : value;
}

function terminalEval(fen: string): number | null {
  const game = new Chess();
  try {
    game.load(fen);
  } catch {
    return null;
  }
  if (game.isCheckmate()) return game.turn() === "w" ? -MATE_CP : MATE_CP;
  if (game.isGameOver()) return 0;
  return null;
}

export interface ReviewOptions {
  startFen: string;
  moves: MoveRecord[];
  moveTimeMs?: number;
  performance?: PerformanceMode;
  onProgress?: (done: number, total: number) => void;
  signal?: { cancelled: boolean };
}

/**
 * Evaluates every position of a finished game with Stockfish and derives
 * per-side accuracy. Runs entirely in the browser worker.
 */
export async function reviewGame({
  startFen,
  moves,
  moveTimeMs = 220,
  performance = "balanced",
  onProgress,
  signal,
}: ReviewOptions): Promise<GameReview> {
  const engine = new StockfishEngine(performance);
  const positions = [startFen, ...moves.map((m) => m.fen)];
  const total = positions.length;
  const scores: (number | null)[] = [];

  try {
    await engine.init();
    for (let i = 0; i < positions.length; i += 1) {
      if (signal?.cancelled) break;
      const fen = positions[i]!;
      const terminal = terminalEval(fen);
      if (terminal !== null) {
        scores.push(terminal);
      } else {
        try {
          const lines = await engine.search({
            fen,
            moveTimeMs,
            multiPv: 1,
            skill: null,
            uciElo: null,
          });
          const best = lines[0];
          scores.push(best ? toWhitePov(fen, best.cp, best.mateIn) : null);
        } catch {
          scores.push(null);
        }
      }
      onProgress?.(i + 1, total);
    }
  } finally {
    engine.destroy();
  }

  while (scores.length < positions.length) scores.push(null);
  const startEval = scores[0] ?? 0;
  const evals = scores.slice(1);
  return {
    evals,
    startEval,
    accuracy: computeAccuracy(startEval, evals, moves),
    reviewedAt: new Date().toISOString(),
  };
}
