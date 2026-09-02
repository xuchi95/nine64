/** Client-safe contracts for the Titan self-play regression (candidate vs published). */

export interface SelfPlayGame {
  index: number;
  /** Colour the candidate config played in this game. */
  candidateColor: "white" | "black";
  result: "candidate_win" | "baseline_win" | "draw" | "error";
  plies: number;
  termination: string;
  error: string | null;
}

export interface SelfPlayRegression {
  ok: boolean;
  code: string | null;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  errors: number;
  /** Candidate score share: (wins + draws/2) / completed games. */
  score: number | null;
  candidateSignature: string;
  baselineSignature: string;
  baselineVersion: number;
  engineVersion: string | null;
  moveTimeMs: number;
  maxPlies: number;
  durationMs: number;
  detail: SelfPlayGame[];
  benchmarkId: string | null;
}
