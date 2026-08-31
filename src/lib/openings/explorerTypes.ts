/**
 * Shared Opening Explorer contract.
 *
 * Client-safe: only types, defaults and the cache-key helper. The browser never
 * talks to a data provider directly — it calls the Nine64 server proxy.
 */

export type ExplorerSource = "masters" | "lichess";

export const EXPLORER_SPEEDS = [
  "ultraBullet",
  "bullet",
  "blitz",
  "rapid",
  "classical",
  "correspondence",
] as const;
export type ExplorerSpeed = (typeof EXPLORER_SPEEDS)[number];

/** Lichess rating buckets (lower bound of each band). */
export const EXPLORER_RATINGS = [400, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500] as const;
export type ExplorerRating = (typeof EXPLORER_RATINGS)[number];

export interface ExplorerFilters {
  source: ExplorerSource;
  speeds: ExplorerSpeed[];
  ratings: ExplorerRating[];
  /** Only count games from this year onwards (both sources support it). */
  sinceYear: number;
}

export const DEFAULT_FILTERS: ExplorerFilters = {
  source: "masters",
  speeds: ["blitz", "rapid", "classical"],
  ratings: [1600, 1800, 2000, 2200, 2500],
  sinceYear: 2015,
};

export interface ExplorerMove {
  uci: string;
  san: string;
  games: number;
  white: number;
  draws: number;
  black: number;
  /** Share of games in this position that continue with this move (0-1). */
  popularity: number;
  /** Score from White's point of view (0-1). */
  whiteScore: number;
  averageRating: number | null;
  eco: string | null;
  openingName: string | null;
}

export interface ExplorerPosition {
  fen: string;
  source: ExplorerSource;
  games: number;
  white: number;
  draws: number;
  black: number;
  eco: string | null;
  openingName: string | null;
  moves: ExplorerMove[];
  /** Where the payload came from, for the UI badge and admin metrics. */
  origin: "cache" | "provider" | "unavailable";
  fetchedAt: string;
  note: string | null;
}

export function normaliseFilters(input: Partial<ExplorerFilters> | undefined): ExplorerFilters {
  const source: ExplorerSource = input?.source === "lichess" ? "lichess" : "masters";
  const speeds = (input?.speeds ?? DEFAULT_FILTERS.speeds).filter((s) =>
    (EXPLORER_SPEEDS as readonly string[]).includes(s),
  );
  const ratings = (input?.ratings ?? DEFAULT_FILTERS.ratings).filter((r) =>
    (EXPLORER_RATINGS as readonly number[]).includes(r),
  );
  const year = Number(input?.sinceYear ?? DEFAULT_FILTERS.sinceYear);
  return {
    source,
    speeds: speeds.length ? [...new Set(speeds)].sort() : [...DEFAULT_FILTERS.speeds],
    ratings: ratings.length ? [...new Set(ratings)].sort((a, b) => a - b) : [...DEFAULT_FILTERS.ratings],
    sinceYear: Number.isFinite(year) ? Math.min(Math.max(Math.trunc(year), 1952), 2100) : DEFAULT_FILTERS.sinceYear,
  };
}

/** Stable cache key: same position + same filters => same row. */
export function explorerCacheKey(fen: string, filters: ExplorerFilters): string {
  const parts =
    filters.source === "masters"
      ? `masters|${filters.sinceYear}`
      : `lichess|${filters.sinceYear}|${filters.speeds.join(",")}|${filters.ratings.join(",")}`;
  return `${parts}|${fen}`;
}

export function scoreOf(white: number, draws: number, black: number): number {
  const total = white + draws + black;
  if (total <= 0) return 0.5;
  return (white + draws / 2) / total;
}
