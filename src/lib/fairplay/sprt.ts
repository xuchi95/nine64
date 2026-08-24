/**
 * Sequential probability ratio test over a player's recent games.
 *
 * One suspicious game can be luck; a stream of them cannot. Each game gives a
 * model probability, and we accumulate the log-likelihood ratio between the
 * "assisted" hypothesis (p1) and the "honest" hypothesis (p0). This lets us act
 * confidently after 3-5 games while keeping single-game false positives harmless.
 */

export type SprtDecision = "honest" | "undecided" | "assisted";

export interface SprtResult {
  llr: number;
  decision: SprtDecision;
  games: number;
  /** Number of games above the monitoring threshold. */
  flagged: number;
}

const P1 = 0.75; // expected per-game score share for an assisted player
const P0 = 0.25; // expected per-game score share for an honest player
const ALPHA = 0.02; // false-positive budget
const BETA = 0.1;

const UPPER = Math.log((1 - BETA) / ALPHA);
const LOWER = Math.log(BETA / (1 - ALPHA));

function clampP(p: number): number {
  return Math.max(0.02, Math.min(0.98, p));
}

export function sprt(probabilities: number[]): SprtResult {
  let llr = 0;
  for (const raw of probabilities) {
    const p = clampP(raw);
    // Bernoulli-style contribution weighted by the model's confidence in the game.
    llr += p * Math.log(P1 / P0) + (1 - p) * Math.log((1 - P1) / (1 - P0));
  }
  const decision: SprtDecision = llr >= UPPER ? "assisted" : llr <= LOWER ? "honest" : "undecided";
  return {
    llr: Math.round(llr * 1000) / 1000,
    decision,
    games: probabilities.length,
    flagged: probabilities.filter((p) => p >= 0.4).length,
  };
}

export const SPRT_BOUNDS = { upper: UPPER, lower: LOWER };
