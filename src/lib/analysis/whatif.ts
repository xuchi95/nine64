/**
 * Retry ("try again") and What-If lab logic.
 *
 * Both labs are engine-driven: the player proposes a legal move, the engine
 * evaluates it, and this module turns the two numbers into a verdict. Nothing
 * here invents a move or a score.
 */
import { Chess } from "chess.js";
import { cpToWinPercent } from "./winrate";

export type RetryVerdict = "solved" | "alsoGood" | "inaccurate" | "worse" | "illegal";

export interface RetryInput {
  /** Position before the mistake. */
  fen: string;
  /** Engine's best move in that position, UCI. */
  bestUci: string | null;
  /** The move the player just tried, UCI. */
  tryUci: string;
  /** Mover-POV win% of the engine move. */
  bestWin: number;
  /** Mover-POV win% after the tried move (engine evaluated). */
  tryWin: number;
}

export interface RetryResult {
  verdict: RetryVerdict;
  san: string | null;
  /** Win% given up versus the engine move, never negative. */
  loss: number;
}

export function moveToSan(fen: string, uci: string): string | null {
  if (uci.length < 4) return null;
  const chess = new Chess();
  try {
    chess.load(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : "q",
    });
    return move?.san ?? null;
  } catch {
    return null;
  }
}

export function judgeRetry(input: RetryInput): RetryResult {
  const san = moveToSan(input.fen, input.tryUci);
  if (!san) return { verdict: "illegal", san: null, loss: 0 };
  if (input.bestUci && input.tryUci === input.bestUci)
    return { verdict: "solved", san, loss: 0 };

  const loss = Math.max(0, Math.round((input.bestWin - input.tryWin) * 10) / 10);
  if (loss <= 2) return { verdict: "alsoGood", san, loss };
  if (loss <= 8) return { verdict: "inaccurate", san, loss };
  return { verdict: "worse", san, loss };
}

export type WhatIfVerdict = "better" | "similar" | "worse";

export interface WhatIfComparison {
  san: string;
  /** Mover-POV win% of the candidate move. */
  candidateWin: number;
  /** Mover-POV win% of the move actually played. */
  playedWin: number;
  delta: number;
  verdict: WhatIfVerdict;
}

export function compareWhatIf(
  fen: string,
  candidateUci: string,
  candidateCp: number,
  playedCp: number,
): WhatIfComparison | null {
  const san = moveToSan(fen, candidateUci);
  if (!san) return null;
  const candidateWin = cpToWinPercent(candidateCp);
  const playedWin = cpToWinPercent(playedCp);
  const delta = Math.round((candidateWin - playedWin) * 10) / 10;
  const verdict: WhatIfVerdict = delta >= 3 ? "better" : delta <= -3 ? "worse" : "similar";
  return { san, candidateWin, playedWin, delta, verdict };
}

/** Progressive hints: never reveal the move before the player asks twice. */
export function retryHints(bestUci: string | null, motifLabels: string[]): string[] {
  const hints: string[] = [];
  if (motifLabels.length > 0) hints.push(motifLabels[0]!);
  if (bestUci) hints.push(bestUci.slice(0, 2));
  return hints;
}
