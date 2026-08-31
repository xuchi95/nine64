/**
 * Deterministic Player Skill Profile.
 *
 * Input = engine-detected skill events (+ finished games for context).
 * Output = 13 dimensions, each with score / confidence / sample / trend.
 *
 * Rules enforced here:
 *  - Bayesian smoothing towards 50 so a 1-event sample never reads as 100/0.
 *  - Confidence is a pure function of sample size; low confidence must be
 *    surfaced instead of hidden, and callers must not state strong conclusions
 *    when `confidence < STRONG_CONFIDENCE`.
 */
import { isSkillKey, type SkillKey } from "@/lib/skills/catalog";
import {
  DIMENSION_KEYS,
  DIMENSION_SKILLS,
  INVERTED_DIMENSIONS,
  type DimensionKey,
} from "./dimensions";

export type BrainOutcome = "positive" | "negative" | "neutral";

export interface BrainEvent {
  skillKey: SkillKey;
  outcome: BrainOutcome;
  source: string;
  createdAt: string;
  /** Move classification from the engine review (`blunder`, `miss`, …). */
  label?: string;
  phase?: string;
  /** True when the engine flagged the position as complex/sharp. */
  complex?: boolean;
}

export interface BrainGame {
  id: string;
  endedAt: string;
  result: "win" | "loss" | "draw";
}

export type Trend = "up" | "down" | "flat" | "unknown";

export interface Dimension {
  key: DimensionKey;
  score: number;
  confidence: number;
  sample: number;
  trend: Trend;
  updatedAt: string | null;
}

export interface PlayerProfile {
  dimensions: Dimension[];
  totalEvents: number;
  games: number;
  generatedAt: string;
}

/** Below this confidence the UI/AI must hedge ("chưa đủ dữ liệu"). */
export const STRONG_CONFIDENCE = 60;
const SMOOTHING = 6; // pseudo-events pulling a small sample towards 50
const CONFIDENCE_HALF = 20; // events needed for 50% confidence
const DAY = 86_400_000;
const WINDOW_DAYS = 14;
const TREND_MIN_SAMPLE = 5;
const TREND_DELTA = 4;

const BAD_LABELS = new Set(["blunder", "mistake"]);
const MISS_LABELS = new Set(["miss"]);

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function confidenceFor(sample: number): number {
  if (sample <= 0) return 0;
  return clamp((sample / (sample + CONFIDENCE_HALF)) * 100);
}

function ratioScore(positives: number, negatives: number): number {
  const total = positives + negatives;
  if (total === 0) return 50;
  return clamp(((positives + SMOOTHING * 0.5) / (total + SMOOTHING)) * 100);
}

/** Inverted dimensions: `rate` is a bad-event frequency, `ceiling` is "0 points". */
function rateScore(bad: number, total: number, ceiling: number): number {
  if (total === 0) return 50;
  const rate = bad / total;
  return clamp((1 - rate / ceiling) * 100);
}

interface Bucket {
  positives: number;
  negatives: number;
  bad: number;
  total: number;
  last: string | null;
}

function emptyBucket(): Bucket {
  return { positives: 0, negatives: 0, bad: 0, total: 0, last: null };
}

const SKILL_TO_DIMS = (() => {
  const map = new Map<SkillKey, DimensionKey[]>();
  for (const dim of DIMENSION_KEYS) {
    for (const skill of DIMENSION_SKILLS[dim]) {
      const list = map.get(skill) ?? [];
      list.push(dim);
      map.set(skill, list);
    }
  }
  return map;
})();

function collect(events: BrainEvent[]): Map<DimensionKey, Bucket> {
  const buckets = new Map<DimensionKey, Bucket>();
  const get = (key: DimensionKey) => {
    let b = buckets.get(key);
    if (!b) {
      b = emptyBucket();
      buckets.set(key, b);
    }
    return b;
  };

  for (const ev of events) {
    if (!isSkillKey(ev.skillKey)) continue;
    const touch = (b: Bucket) => {
      if (!b.last || ev.createdAt > b.last) b.last = ev.createdAt;
    };

    for (const dim of SKILL_TO_DIMS.get(ev.skillKey) ?? []) {
      const b = get(dim);
      if (ev.outcome === "positive") b.positives += 1;
      else if (ev.outcome === "negative") b.negatives += 1;
      b.total += 1;
      touch(b);
    }

    // Label-derived dimensions look at every reviewed move once.
    const label = (ev.label ?? "").toLowerCase();
    const blunder = get("blunder_frequency");
    blunder.total += 1;
    if (BAD_LABELS.has(label)) blunder.bad += 1;
    touch(blunder);

    const missed = get("missed_win_frequency");
    missed.total += 1;
    if (MISS_LABELS.has(label)) missed.bad += 1;
    touch(missed);

    // "Complex position" = engine-flagged sharp positions, otherwise middlegame.
    const isComplex = ev.complex === true || (ev.complex === undefined && ev.phase === "middlegame");
    if (isComplex) {
      const cx = get("complex_position");
      if (ev.outcome === "positive") cx.positives += 1;
      else if (ev.outcome === "negative") cx.negatives += 1;
      cx.total += 1;
      touch(cx);
    }
  }
  return buckets;
}

function scoreOf(dim: DimensionKey, b: Bucket): number {
  if (dim === "blunder_frequency") return rateScore(b.bad, b.total, 0.15);
  if (dim === "missed_win_frequency") return rateScore(b.bad, b.total, 0.1);
  return ratioScore(b.positives, b.negatives);
}

function sampleOf(dim: DimensionKey, b: Bucket): number {
  return INVERTED_DIMENSIONS.includes(dim) ? b.total : b.positives + b.negatives;
}

function windowTrend(dim: DimensionKey, events: BrainEvent[], now: Date): Trend {
  const recentFrom = now.getTime() - WINDOW_DAYS * DAY;
  const priorFrom = now.getTime() - 2 * WINDOW_DAYS * DAY;
  const inRange = (ev: BrainEvent, from: number, to: number) => {
    const t = Date.parse(ev.createdAt);
    return Number.isFinite(t) && t >= from && t < to;
  };
  const recent = collect(events.filter((e) => inRange(e, recentFrom, now.getTime() + 1))).get(dim);
  const prior = collect(events.filter((e) => inRange(e, priorFrom, recentFrom))).get(dim);
  if (!recent || !prior) return "unknown";
  if (sampleOf(dim, recent) < TREND_MIN_SAMPLE || sampleOf(dim, prior) < TREND_MIN_SAMPLE)
    return "unknown";
  const delta = scoreOf(dim, recent) - scoreOf(dim, prior);
  if (delta >= TREND_DELTA) return "up";
  if (delta <= -TREND_DELTA) return "down";
  return "flat";
}

export function buildPlayerProfile(input: {
  events: BrainEvent[];
  games?: BrainGame[];
  now?: Date;
}): PlayerProfile {
  const now = input.now ?? new Date();
  const events = input.events ?? [];
  const buckets = collect(events);

  const dimensions: Dimension[] = DIMENSION_KEYS.map((key) => {
    const b = buckets.get(key) ?? emptyBucket();
    const sample = sampleOf(key, b);
    return {
      key,
      score: sample === 0 ? 50 : scoreOf(key, b),
      confidence: confidenceFor(sample),
      sample,
      trend: windowTrend(key, events, now),
      updatedAt: b.last,
    };
  });

  return {
    dimensions,
    totalEvents: events.length,
    games: input.games?.length ?? 0,
    generatedAt: now.toISOString(),
  };
}

export function dimension(profile: PlayerProfile, key: DimensionKey): Dimension {
  const found = profile.dimensions.find((d) => d.key === key);
  if (!found) throw new Error(`UNKNOWN_DIMENSION:${key}`);
  return found;
}

/**
 * Weakest dimensions that carry enough evidence to act on. Dimensions below
 * the confidence floor are still returned (training needs a target) but the
 * caller must label them as tentative.
 */
export function weakestDimensions(profile: PlayerProfile, limit = 3): Dimension[] {
  return [...profile.dimensions]
    .filter((d) => d.sample > 0)
    .sort((a, b) => a.score - b.score || b.confidence - a.confidence)
    .slice(0, limit);
}

export function strongestDimensions(profile: PlayerProfile, limit = 3): Dimension[] {
  return [...profile.dimensions]
    .filter((d) => d.confidence >= 30)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence)
    .slice(0, limit);
}
