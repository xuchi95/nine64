/**
 * Adaptive Daily Plan generator.
 *
 * Deterministic given the same inputs (profile, due cards, recent games,
 * fatigue, rating, budget, date) — the same day always regenerates the same
 * plan, so a reload never reshuffles a session in progress.
 *
 * Every block carries a machine-readable `reason`, which powers the
 * "Why this exercise?" explanation in the UI.
 */
import { DIMENSION_PRACTICE, type DimensionKey } from "./dimensions";
import { STRONG_CONFIDENCE, weakestDimensions, type Dimension, type PlayerProfile } from "./profile";

export type PlanBudget = 10 | 20 | 30 | 45;
export const PLAN_BUDGETS: PlanBudget[] = [10, 20, 30, 45];

export type BlockKind =
  | "tactics"
  | "opening_recall"
  | "endgame"
  | "srs_review"
  | "retry"
  | "bot_challenge"
  | "review";

export type Difficulty = "easy" | "normal" | "hard";

export type ReasonCode =
  | "weakest_skill"
  | "low_confidence_probe"
  | "srs_due"
  | "recent_mistake"
  | "rating_calibration"
  | "fatigue_easy"
  | "maintenance";

export interface PlanBlock {
  id: string;
  kind: BlockKind;
  minutes: number;
  targetDimension: DimensionKey | null;
  difficulty: Difficulty;
  reason: { code: ReasonCode; params: Record<string, string | number> };
  route: string;
}

export interface FatigueSignal {
  /** Sessions completed in the last 3 days. */
  recentSessions: number;
  /** Failed / abandoned blocks in the last 3 days. */
  recentFailures: number;
  /** Consecutive days trained up to and including yesterday. */
  streakDays: number;
}

export interface RetryCandidate {
  gameId: string;
  ply: number;
  label: string;
}

export interface PlanContext {
  profile: PlayerProfile;
  dueCards: number;
  retryCandidates: RetryCandidate[];
  rating: number;
  budget: PlanBudget;
  fatigue: FatigueSignal;
  /** ISO date (YYYY-MM-DD) the plan is for. */
  date: string;
}

export interface DailyPlan {
  date: string;
  budget: PlanBudget;
  blocks: PlanBlock[];
  totalMinutes: number;
  fatigueAdjusted: boolean;
  focus: DimensionKey[];
}

const ROUTE: Record<BlockKind, string> = {
  tactics: "/puzzles",
  opening_recall: "/openings",
  endgame: "/drills",
  srs_review: "/puzzles",
  retry: "/games",
  bot_challenge: "/play/bot",
  review: "/analysis",
};

function kindForDimension(dim: DimensionKey): BlockKind {
  const practice = DIMENSION_PRACTICE[dim];
  if (practice === "tactics") return "tactics";
  if (practice === "opening") return "opening_recall";
  if (practice === "endgame") return "endgame";
  if (practice === "retry") return "retry";
  return "review";
}

/** High fatigue = trained a lot recently and failing more than succeeding. */
export function isFatigued(f: FatigueSignal): boolean {
  return f.recentFailures >= 3 || (f.recentSessions >= 3 && f.recentFailures >= 2) || f.streakDays >= 6;
}

function difficultyFor(rating: number, fatigued: boolean, dim: Dimension | null): Difficulty {
  if (fatigued) return "easy";
  if (dim && dim.score < 40) return "easy";
  if (rating >= 1800) return "hard";
  if (rating >= 1400) return "normal";
  return "easy";
}

interface Candidate {
  priority: number;
  minutes: number;
  block: Omit<PlanBlock, "id" | "route">;
}

export function generateDailyPlan(ctx: PlanContext): DailyPlan {
  const fatigued = isFatigued(ctx.fatigue);
  const weakest = weakestDimensions(ctx.profile, 3);
  const candidates: Candidate[] = [];

  if (ctx.dueCards > 0) {
    candidates.push({
      priority: 100,
      minutes: Math.max(5, Math.min(10, Math.ceil(ctx.dueCards / 4) * 5)),
      block: {
        kind: "srs_review",
        minutes: 0,
        targetDimension: null,
        difficulty: "normal",
        reason: { code: "srs_due", params: { count: ctx.dueCards } },
      },
    });
  }

  weakest.forEach((dim, index) => {
    const lowConfidence = dim.confidence < STRONG_CONFIDENCE;
    candidates.push({
      priority: 90 - index * 10,
      minutes: 5,
      block: {
        kind: kindForDimension(dim.key),
        minutes: 0,
        targetDimension: dim.key,
        difficulty: difficultyFor(ctx.rating, fatigued, dim),
        reason: {
          code: lowConfidence ? "low_confidence_probe" : "weakest_skill",
          params: { dimension: dim.key, score: dim.score, confidence: dim.confidence, sample: dim.sample },
        },
      },
    });
  });

  const retry = ctx.retryCandidates[0];
  if (retry) {
    // Beats a weakness block that would map to the same "retry" kind: replaying
    // a concrete mistake from the player's own game is the stronger exercise.
    candidates.push({
      priority: 95,
      minutes: 5,
      block: {
        kind: "retry",
        minutes: 0,
        targetDimension: null,
        difficulty: fatigued ? "easy" : "normal",
        reason: { code: "recent_mistake", params: { gameId: retry.gameId, ply: retry.ply, label: retry.label } },
      },
    });
  }

  if (!fatigued) {
    candidates.push({
      priority: 40,
      minutes: 10,
      block: {
        kind: "bot_challenge",
        minutes: 0,
        targetDimension: null,
        difficulty: difficultyFor(ctx.rating, false, null),
        reason: { code: "rating_calibration", params: { rating: ctx.rating } },
      },
    });
  } else {
    candidates.push({
      priority: 45,
      minutes: 5,
      block: {
        kind: "review",
        minutes: 0,
        targetDimension: null,
        difficulty: "easy",
        reason: {
          code: "fatigue_easy",
          params: { failures: ctx.fatigue.recentFailures, sessions: ctx.fatigue.recentSessions },
        },
      },
    });
  }

  // Baseline maintenance so a plan is never empty on a fresh account.
  candidates.push({
    priority: 20,
    minutes: 5,
    block: {
      kind: "tactics",
      minutes: 0,
      targetDimension: null,
      difficulty: difficultyFor(ctx.rating, fatigued, null),
      reason: { code: "maintenance", params: {} },
    },
  });

  const ordered = [...candidates].sort((a, b) => b.priority - a.priority);
  const blocks: PlanBlock[] = [];
  const usedKinds = new Set<BlockKind>();
  let remaining = ctx.budget;

  for (const c of ordered) {
    if (remaining < 5) break;
    if (usedKinds.has(c.block.kind) && c.block.kind !== "tactics") continue;
    if (c.block.kind === "tactics" && usedKinds.has("tactics") && remaining < 10) continue;
    const minutes = Math.min(c.minutes, remaining);
    if (minutes < 5) continue;
    usedKinds.add(c.block.kind);
    remaining -= minutes;
    blocks.push({
      ...c.block,
      minutes,
      id: `${ctx.date}-${c.block.kind}-${blocks.length + 1}`,
      route: ROUTE[c.block.kind],
    });
  }

  // Spend any leftover minutes on the first weakness-targeted block.
  if (remaining >= 5 && blocks.length > 0) {
    const target = blocks.find((b) => b.targetDimension) ?? blocks[0]!;
    target.minutes += remaining;
    remaining = 0;
  }

  return {
    date: ctx.date,
    budget: ctx.budget,
    blocks,
    totalMinutes: blocks.reduce((sum, b) => sum + b.minutes, 0),
    fatigueAdjusted: fatigued,
    focus: weakest.map((d) => d.key),
  };
}
