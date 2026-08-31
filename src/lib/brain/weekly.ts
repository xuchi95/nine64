/**
 * Weekly Progress Report — deterministic facts only.
 *
 * The AI may rewrite these facts into prose, but every number here is computed
 * from stored skill events, games and training sessions.
 */
import type { SkillKey } from "@/lib/skills/catalog";
import { DIMENSION_SKILLS, type DimensionKey } from "./dimensions";
import {
  buildPlayerProfile,
  STRONG_CONFIDENCE,
  type BrainEvent,
  type BrainGame,
  type Dimension,
} from "./profile";

const DAY = 86_400_000;
const MIN_SAMPLE = 4;
const MOVE_DELTA = 4;

export interface SessionSummary {
  date: string;
  minutes: number;
  completedBlocks: number;
  failedBlocks: number;
}

export interface DimensionShift {
  key: DimensionKey;
  before: number;
  after: number;
  delta: number;
  sample: number;
  confidence: number;
}

export interface WeeklyReport {
  from: string;
  to: string;
  improved: DimensionShift[];
  declining: DimensionShift[];
  recurringMistakes: { skillKey: SkillKey; count: number }[];
  openingLeak: { skillKey: SkillKey; count: number } | null;
  recommendedFocus: DimensionKey[];
  activity: {
    sessions: number;
    minutes: number;
    completedBlocks: number;
    failedBlocks: number;
    games: number;
    wins: number;
    losses: number;
    draws: number;
    events: number;
  };
  /** True when the week is too thin to draw strong conclusions. */
  lowData: boolean;
}

function inWindow(iso: string, from: number, to: number): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= from && t < to;
}

export function buildWeeklyReport(input: {
  events: BrainEvent[];
  games: BrainGame[];
  sessions: SessionSummary[];
  now?: Date;
}): WeeklyReport {
  const now = input.now ?? new Date();
  const toMs = now.getTime();
  const fromMs = toMs - 7 * DAY;
  const priorFromMs = toMs - 14 * DAY;

  const recentEvents = input.events.filter((e) => inWindow(e.createdAt, fromMs, toMs + 1));
  const priorEvents = input.events.filter((e) => inWindow(e.createdAt, priorFromMs, fromMs));

  const recent = buildPlayerProfile({ events: recentEvents, now });
  const prior = buildPlayerProfile({ events: priorEvents, now: new Date(fromMs) });
  const priorByKey = new Map(prior.dimensions.map((d) => [d.key, d]));

  const shifts: DimensionShift[] = [];
  for (const d of recent.dimensions) {
    const before = priorByKey.get(d.key);
    if (!before || before.sample < MIN_SAMPLE || d.sample < MIN_SAMPLE) continue;
    shifts.push({
      key: d.key,
      before: before.score,
      after: d.score,
      delta: d.score - before.score,
      sample: d.sample,
      confidence: d.confidence,
    });
  }

  const improved = shifts.filter((s) => s.delta >= MOVE_DELTA).sort((a, b) => b.delta - a.delta).slice(0, 3);
  const declining = shifts.filter((s) => s.delta <= -MOVE_DELTA).sort((a, b) => a.delta - b.delta).slice(0, 3);

  const negatives = new Map<SkillKey, number>();
  for (const e of recentEvents) {
    if (e.outcome !== "negative") continue;
    negatives.set(e.skillKey, (negatives.get(e.skillKey) ?? 0) + 1);
  }
  const recurringMistakes = [...negatives.entries()]
    .map(([skillKey, count]) => ({ skillKey, count }))
    .filter((r) => r.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const openingSkills = new Set<SkillKey>(DIMENSION_SKILLS.opening);
  const openingLeak =
    recurringMistakes.find((r) => openingSkills.has(r.skillKey)) ??
    [...negatives.entries()]
      .filter(([k]) => openingSkills.has(k))
      .map(([skillKey, count]) => ({ skillKey, count }))
      .sort((a, b) => b.count - a.count)[0] ??
    null;

  const focusPool: Dimension[] = [...recent.dimensions].filter((d) => d.sample >= MIN_SAMPLE);
  const recommendedFocus = focusPool
    .sort((a, b) => a.score - b.score || b.sample - a.sample)
    .slice(0, 3)
    .map((d) => d.key);

  const weekSessions = input.sessions.filter((s) => inWindow(`${s.date}T12:00:00.000Z`, fromMs, toMs + 1));
  const weekGames = input.games.filter((g) => inWindow(g.endedAt, fromMs, toMs + 1));

  const activity = {
    sessions: weekSessions.length,
    minutes: weekSessions.reduce((n, s) => n + s.minutes, 0),
    completedBlocks: weekSessions.reduce((n, s) => n + s.completedBlocks, 0),
    failedBlocks: weekSessions.reduce((n, s) => n + s.failedBlocks, 0),
    games: weekGames.length,
    wins: weekGames.filter((g) => g.result === "win").length,
    losses: weekGames.filter((g) => g.result === "loss").length,
    draws: weekGames.filter((g) => g.result === "draw").length,
    events: recentEvents.length,
  };

  const bestConfidence = Math.max(0, ...recent.dimensions.map((d) => d.confidence));
  return {
    from: new Date(fromMs).toISOString(),
    to: now.toISOString(),
    improved,
    declining,
    recurringMistakes,
    openingLeak,
    recommendedFocus,
    activity,
    lowData: bestConfidence < STRONG_CONFIDENCE || activity.events < 10,
  };
}
