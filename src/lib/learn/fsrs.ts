/**
 * FSRS-lite spaced repetition scheduler (difficulty / stability / retrievability).
 * Simplified from FSRS-4.5 with a fixed weight vector tuned for chess motifs.
 */

export type Grade = 1 | 2 | 3 | 4; // again, hard, good, easy

export interface SrsState {
  /** 1-10, higher = harder for this user. */
  difficulty: number;
  /** Memory stability in days. */
  stability: number;
  reps: number;
  lapses: number;
  /** ISO date of the next review. */
  due: string;
  lastReview: string | null;
}

const W = {
  initialStability: [0.4, 1.2, 3.2, 8.0],
  initialDifficulty: 5.6,
  difficultyDelta: 0.9,
  meanReversion: 0.06,
  stabilityFactor: 2.4,
  hardPenalty: 0.75,
  easyBonus: 1.4,
  lapseFactor: 0.35,
};
const DESIRED_RETENTION = 0.9;
const DECAY = -0.5;
const FACTOR = 19 / 81;
const DAY_MS = 86_400_000;

export function initialState(now = new Date()): SrsState {
  return {
    difficulty: W.initialDifficulty,
    stability: 0,
    reps: 0,
    lapses: 0,
    due: now.toISOString(),
    lastReview: null,
  };
}

/** Probability of recall after `elapsedDays` at the given stability. */
export function retrievability(stability: number, elapsedDays: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

function nextInterval(stability: number): number {
  const days = (stability / FACTOR) * (Math.pow(DESIRED_RETENTION, 1 / DECAY) - 1);
  return Math.max(1, Math.min(365, Math.round(days)));
}

function clampDifficulty(d: number): number {
  return Math.max(1, Math.min(10, Math.round(d * 100) / 100));
}

export function review(state: SrsState, grade: Grade, now = new Date()): SrsState {
  const elapsedDays = state.lastReview
    ? Math.max(0, (now.getTime() - new Date(state.lastReview).getTime()) / DAY_MS)
    : 0;

  let difficulty: number;
  let stability: number;

  if (state.reps === 0 || state.stability === 0) {
    difficulty = clampDifficulty(W.initialDifficulty - W.difficultyDelta * (grade - 3));
    stability = W.initialStability[grade - 1]!;
  } else {
    const target = clampDifficulty(state.difficulty - W.difficultyDelta * (grade - 3));
    difficulty = clampDifficulty(
      target + W.meanReversion * (W.initialDifficulty - target),
    );
    const r = retrievability(state.stability, elapsedDays);
    if (grade === 1) {
      stability = Math.max(0.4, state.stability * W.lapseFactor * (1 - r * 0.5));
    } else {
      const gradeMul = grade === 2 ? W.hardPenalty : grade === 4 ? W.easyBonus : 1;
      const growth =
        1 + W.stabilityFactor * ((11 - difficulty) / 10) * (1 - r) * gradeMul;
      stability = state.stability * Math.max(1.05, growth);
    }
  }

  stability = Math.round(stability * 1000) / 1000;
  const interval = grade === 1 ? 1 : nextInterval(stability);
  return {
    difficulty,
    stability,
    reps: state.reps + 1,
    lapses: state.lapses + (grade === 1 ? 1 : 0),
    due: new Date(now.getTime() + interval * DAY_MS).toISOString(),
    lastReview: now.toISOString(),
  };
}

export function isDue(state: SrsState, now = new Date()): boolean {
  return new Date(state.due).getTime() <= now.getTime();
}

/** Due cards first, then the least-retrievable ones. */
export function sortByUrgency<T extends { srs: SrsState }>(cards: T[], now = new Date()): T[] {
  return cards.slice().sort((a, b) => {
    const aDue = isDue(a.srs, now) ? 0 : 1;
    const bDue = isDue(b.srs, now) ? 0 : 1;
    if (aDue !== bDue) return aDue - bDue;
    const elapsed = (s: SrsState) =>
      s.lastReview ? (now.getTime() - new Date(s.lastReview).getTime()) / DAY_MS : 999;
    return retrievability(a.srs.stability, elapsed(a.srs)) -
      retrievability(b.srs.stability, elapsed(b.srs));
  });
}
