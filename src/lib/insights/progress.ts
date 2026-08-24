import type { SavedGame } from "@/lib/history";
import { ratingFromAcpl } from "@/lib/analysis/winrate";

export interface RatingPoint {
  date: string;
  value: number;
}

export interface ProgressReport {
  points: RatingPoint[];
  /** Rating over the most recent window. */
  current: number | null;
  /** Slope per day from weighted linear regression. */
  slopePerDay: number;
  /** Projected rating in 30 days. */
  forecast30: number | null;
  trend: "up" | "down" | "flat";
}

/** Performance rating over a sliding window of reviewed games. */
export function performanceSeries(games: SavedGame[], window = 5): RatingPoint[] {
  const reviewed = games
    .filter((g) => g.review?.summary)
    .slice()
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt));
  const points: RatingPoint[] = [];
  for (let i = 0; i < reviewed.length; i += 1) {
    const slice = reviewed.slice(Math.max(0, i - window + 1), i + 1);
    const losses = slice.map((g) => {
      const color = g.playerColor ?? "w";
      return g.review!.summary!.acpl[color];
    });
    const avg = losses.reduce((a, b) => a + b, 0) / losses.length;
    points.push({ date: reviewed[i]!.playedAt, value: ratingFromAcpl(avg) });
  }
  return points;
}

/** Exponentially weighted least squares — recent games matter more. */
export function forecast(points: RatingPoint[], halfLifeDays = 14): ProgressReport {
  if (points.length === 0) {
    return { points, current: null, slopePerDay: 0, forecast30: null, trend: "flat" };
  }
  const last = points[points.length - 1]!;
  const t0 = new Date(last.date).getTime();
  const DAY = 86_400_000;
  const xs = points.map((p) => (new Date(p.date).getTime() - t0) / DAY);
  const ws = xs.map((x) => Math.pow(0.5, Math.abs(x) / halfLifeDays));
  const sw = ws.reduce((a, b) => a + b, 0);
  const mx = xs.reduce((a, x, i) => a + x * ws[i]!, 0) / sw;
  const my = points.reduce((a, p, i) => a + p.value * ws[i]!, 0) / sw;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += ws[i]! * (x - mx) * (points[i]!.value - my);
    den += ws[i]! * (x - mx) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;
  const forecast30 = Math.round(last.value + slope * 30);
  return {
    points,
    current: last.value,
    slopePerDay: Math.round(slope * 100) / 100,
    forecast30: Math.max(400, Math.min(2900, forecast30)),
    trend: slope > 0.5 ? "up" : slope < -0.5 ? "down" : "flat",
  };
}
