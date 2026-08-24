/**
 * Fair Play observability.
 *
 * Everything here is derived from the rows the engine already writes
 * (`fairplay_reports` + `fairplay_actions`), so metrics can never drift from
 * the decisions actually taken.
 */
import { THRESHOLDS } from "./thresholds";

export interface MetricReport {
  score: number;
  probability: number;
  rating: number;
  eval_ms: number;
  created_at: string;
}

export interface MetricAction {
  user_id: string;
  action: string;
  automatic: boolean;
  created_at: string;
}

export interface SegmentMetric {
  key: string;
  label: string;
  reports: number;
  flagged: number;
  held: number;
  /** Share of reviewed games that reached at least "monitor". */
  flagRate: number;
  /** Share of reviewed games that reached the rating-hold threshold. */
  holdRate: number;
  avgScore: number;
  avgEvalMs: number;
  p95EvalMs: number;
}

export interface FairplayMetrics {
  totals: {
    reports: number;
    flagged: number;
    held: number;
    flagRate: number;
    last24h: number;
  };
  processing: {
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
  };
  falseAlarm: {
    /** Distinct players that received an automatic restriction. */
    automaticCases: number;
    /** Players an admin cleared afterwards. */
    clearedCases: number;
    /** Players an admin confirmed with a manual hold. */
    confirmedCases: number;
    rate: number;
    reviewed: number;
  };
  segments: SegmentMetric[];
  daily: { day: string; reports: number; flagged: number }[];
}

const BRACKETS: { key: string; label: string; min: number; max: number }[] = [
  { key: "u1000", label: "< 1000", min: -Infinity, max: 999 },
  { key: "1000", label: "1000–1399", min: 1000, max: 1399 },
  { key: "1400", label: "1400–1799", min: 1400, max: 1799 },
  { key: "1800", label: "1800–2199", min: 1800, max: 2199 },
  { key: "2200", label: "2200+", min: 2200, max: Infinity },
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round(v: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function computeFairplayMetrics(
  reports: MetricReport[],
  actions: MetricAction[],
  now = Date.now(),
): FairplayMetrics {
  const flagged = reports.filter((r) => r.score >= THRESHOLDS.monitor);
  const held = reports.filter((r) => r.score >= THRESHOLDS.hold);
  const evalMs = reports.map((r) => r.eval_ms).filter((v) => v > 0).sort((a, b) => a - b);

  const segments = BRACKETS.map<SegmentMetric>((bracket) => {
    const rows = reports.filter((r) => r.rating >= bracket.min && r.rating <= bracket.max);
    const segEval = rows.map((r) => r.eval_ms).filter((v) => v > 0).sort((a, b) => a - b);
    const segFlagged = rows.filter((r) => r.score >= THRESHOLDS.monitor).length;
    const segHeld = rows.filter((r) => r.score >= THRESHOLDS.hold).length;
    return {
      key: bracket.key,
      label: bracket.label,
      reports: rows.length,
      flagged: segFlagged,
      held: segHeld,
      flagRate: rows.length ? round((segFlagged / rows.length) * 100) : 0,
      holdRate: rows.length ? round((segHeld / rows.length) * 100) : 0,
      avgScore: round(mean(rows.map((r) => r.score))),
      avgEvalMs: Math.round(mean(segEval)),
      p95EvalMs: Math.round(percentile(segEval, 95)),
    };
  });

  const automaticUsers = new Set(
    actions.filter((a) => a.automatic && a.action !== "none").map((a) => a.user_id),
  );
  const clearedUsers = new Set(
    actions.filter((a) => !a.automatic && (a.action === "cleared" || a.action === "unlocked")).map((a) => a.user_id),
  );
  const confirmedUsers = new Set(
    actions.filter((a) => !a.automatic && a.action === "rating_hold").map((a) => a.user_id),
  );
  const clearedAuto = [...clearedUsers].filter((id) => automaticUsers.has(id));
  const confirmedAuto = [...confirmedUsers].filter((id) => automaticUsers.has(id));
  const reviewed = new Set([...clearedAuto, ...confirmedAuto]).size;

  const dayKeys: string[] = [];
  for (let i = 13; i >= 0; i--) {
    dayKeys.push(new Date(now - i * 86_400_000).toISOString().slice(0, 10));
  }
  const daily = dayKeys.map((day) => {
    const rows = reports.filter((r) => r.created_at.slice(0, 10) === day);
    return {
      day,
      reports: rows.length,
      flagged: rows.filter((r) => r.score >= THRESHOLDS.monitor).length,
    };
  });

  return {
    totals: {
      reports: reports.length,
      flagged: flagged.length,
      held: held.length,
      flagRate: reports.length ? round((flagged.length / reports.length) * 100) : 0,
      last24h: reports.filter((r) => now - new Date(r.created_at).getTime() <= 86_400_000).length,
    },
    processing: {
      avgMs: Math.round(mean(evalMs)),
      p50Ms: Math.round(percentile(evalMs, 50)),
      p95Ms: Math.round(percentile(evalMs, 95)),
      maxMs: evalMs.length ? evalMs[evalMs.length - 1]! : 0,
    },
    falseAlarm: {
      automaticCases: automaticUsers.size,
      clearedCases: clearedAuto.length,
      confirmedCases: confirmedAuto.length,
      rate: reviewed ? round((clearedAuto.length / reviewed) * 100) : 0,
      reviewed,
    },
    segments,
    daily,
  };
}
