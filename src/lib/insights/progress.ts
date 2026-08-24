import type { SavedGame } from "@/lib/history";
import type { PlyAnalysis } from "@/lib/analysis/types";
import type { MistakeSeverity } from "@/lib/coach/types";

/** Which side the report is written for (human side in AI games, white in local). */
export function playerSide(game: SavedGame): "w" | "b" {
  return game.playerColor ?? "w";
}

export function playerPlies(game: SavedGame): PlyAnalysis[] {
  const side = playerSide(game);
  return (game.review?.plies ?? []).filter((p) => p.color === side);
}

export interface GamePoint {
  id: string;
  playedAt: string;
  label: string;
  moves: number;
  /** Average win-% thrown away per own move. */
  lossPct: number | null;
  accuracy: number | null;
  /** Mistakes per 100 own moves, by engine label bucket. */
  inaccuracies: number;
  mistakes: number;
  blunders: number;
  /** Coach mistake counts by severity, when a coach report exists. */
  severity: Record<MistakeSeverity, number> | null;
  /** Average seconds spent per own move, when timing was captured. */
  secPerMove: number | null;
  /** Share of own moves played in under 2s (rushing). */
  rushShare: number | null;
}

const EMPTY_SEVERITY: Record<MistakeSeverity, number> = {
  basic: 0,
  moderate: 0,
  serious: 0,
  critical: 0,
};

function gameLabel(game: SavedGame): string {
  return `${game.white.name} – ${game.black.name}`;
}

export function gamePoint(game: SavedGame): GamePoint {
  const plies = playerPlies(game);
  const side = playerSide(game);
  const timed = plies.filter((p) => typeof p.spentMs === "number" && (p.spentMs ?? 0) > 0);
  const per100 = plies.length > 0 ? 100 / plies.length : 0;

  let severity: Record<MistakeSeverity, number> | null = null;
  if (game.coach) {
    severity = { ...EMPTY_SEVERITY };
    for (const m of game.coach.mistakes) severity[m.severity] += 1;
  }

  return {
    id: game.id,
    playedAt: game.playedAt,
    label: gameLabel(game),
    moves: plies.length,
    lossPct:
      plies.length > 0 ? plies.reduce((s, p) => s + Math.max(0, p.loss), 0) / plies.length : null,
    accuracy: game.review ? game.review.accuracy[side] : null,
    inaccuracies: plies.filter((p) => p.label === "inaccuracy").length * per100,
    mistakes: plies.filter((p) => p.label === "mistake" || p.label === "miss").length * per100,
    blunders: plies.filter((p) => p.label === "blunder").length * per100,
    severity,
    secPerMove:
      timed.length > 0 ? timed.reduce((s, p) => s + (p.spentMs ?? 0), 0) / timed.length / 1000 : null,
    rushShare:
      timed.length > 0 ? timed.filter((p) => (p.spentMs ?? 0) < 2000).length / timed.length : null,
  };
}

export interface Bucket {
  key: string;
  label: string;
  start: string;
  points: GamePoint[];
  games: number;
  lossPct: number | null;
  accuracy: number | null;
  inaccuracies: number | null;
  mistakes: number | null;
  blunders: number | null;
  severity: Record<MistakeSeverity, number>;
  severityPerGame: Record<MistakeSeverity, number>;
  secPerMove: number | null;
  rushShare: number | null;
}

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Monday-first
  d.setDate(d.getDate() - day);
  return d;
}

function fmtDate(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export type Granularity = "day" | "week" | "month";

function bucketKey(date: Date, granularity: Granularity): { key: string; start: Date; label: string } {
  if (granularity === "day") {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return { key: start.toISOString(), start, label: fmtDate(start) };
  }
  if (granularity === "month") {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    return { key: start.toISOString(), start, label: `${start.getMonth() + 1}/${start.getFullYear()}` };
  }
  const start = startOfWeek(date);
  return { key: start.toISOString(), start, label: `Tuần ${fmtDate(start)}` };
}

/** Group analysed games into time buckets, oldest first. */
export function buildProgress(games: SavedGame[], granularity: Granularity = "week"): Bucket[] {
  const analysed = games.filter((g) => g.review?.plies?.length || g.coach);
  const map = new Map<string, Bucket>();

  for (const game of analysed) {
    const date = new Date(game.playedAt);
    if (Number.isNaN(date.getTime())) continue;
    const { key, start, label } = bucketKey(date, granularity);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        key,
        label,
        start: start.toISOString(),
        points: [],
        games: 0,
        lossPct: null,
        accuracy: null,
        inaccuracies: null,
        mistakes: null,
        blunders: null,
        severity: { ...EMPTY_SEVERITY },
        severityPerGame: { ...EMPTY_SEVERITY },
        secPerMove: null,
        rushShare: null,
      };
      map.set(key, bucket);
    }
    bucket.points.push(gamePoint(game));
  }

  const buckets = [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
  for (const b of buckets) {
    b.games = b.points.length;
    b.lossPct = avg(b.points.map((p) => p.lossPct));
    b.accuracy = avg(b.points.map((p) => p.accuracy));
    const withMoves = b.points.filter((p) => p.moves > 0);
    b.inaccuracies = avg(withMoves.map((p) => p.inaccuracies));
    b.mistakes = avg(withMoves.map((p) => p.mistakes));
    b.blunders = avg(withMoves.map((p) => p.blunders));
    const coached = b.points.filter((p) => p.severity);
    for (const p of coached) {
      for (const k of Object.keys(EMPTY_SEVERITY) as MistakeSeverity[]) {
        b.severity[k] += p.severity![k];
      }
    }
    for (const k of Object.keys(EMPTY_SEVERITY) as MistakeSeverity[]) {
      b.severityPerGame[k] = coached.length > 0 ? b.severity[k] / coached.length : 0;
    }
    b.secPerMove = avg(b.points.map((p) => p.secPerMove));
    b.rushShare = avg(b.points.map((p) => p.rushShare));
  }
  return buckets;
}

export interface Delta {
  /** Average across the earlier half of the range. */
  before: number | null;
  /** Average across the most recent half. */
  after: number | null;
  /** after - before; null when either side is missing. */
  change: number | null;
}

export function trend(buckets: Bucket[], pick: (b: Bucket) => number | null): Delta {
  const values = buckets.map(pick);
  const idx = values.map((v, i) => ({ v, i })).filter((x) => typeof x.v === "number");
  if (idx.length < 2) {
    const only = idx[0]?.v ?? null;
    return { before: null, after: only ?? null, change: null };
  }
  const half = Math.floor(idx.length / 2);
  const before = avg(idx.slice(0, half).map((x) => x.v));
  const after = avg(idx.slice(half).map((x) => x.v));
  return {
    before,
    after,
    change: before !== null && after !== null ? after - before : null,
  };
}

/** Overall snapshot for the whole analysed range. */
export function totals(buckets: Bucket[]) {
  const points = buckets.flatMap((b) => b.points);
  const coached = points.filter((p) => p.severity);
  const severity = { ...EMPTY_SEVERITY };
  for (const p of coached) {
    for (const k of Object.keys(EMPTY_SEVERITY) as MistakeSeverity[]) severity[k] += p.severity![k];
  }
  return {
    games: points.length,
    coachedGames: coached.length,
    moves: points.reduce((s, p) => s + p.moves, 0),
    lossPct: avg(points.map((p) => p.lossPct)),
    accuracy: avg(points.map((p) => p.accuracy)),
    secPerMove: avg(points.map((p) => p.secPerMove)),
    rushShare: avg(points.map((p) => p.rushShare)),
    severity,
  };
}
