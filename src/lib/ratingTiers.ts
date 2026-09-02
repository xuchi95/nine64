/**
 * Nine64 rank ladder — presentational tiers derived from the player's
 * Glicko-2 rating. Pure functions, no I/O. The database remains the only
 * authority for ratings; tiers are just a display mapping.
 */

export type TierId =
  | "rookie"
  | "apprentice"
  | "club"
  | "challenger"
  | "expert"
  | "master"
  | "grandmaster"
  | "legend";

export interface RatingTier {
  id: TierId;
  min: number;
  i18nKey: string;
  /** Tailwind classes for the tier badge / accents. */
  badgeClass: string;
  barClass: string;
}

/** Ascending by min. The last tier is the top of the ladder. */
export const RATING_TIERS: readonly RatingTier[] = [
  {
    id: "rookie",
    min: 0,
    i18nKey: "rank.tier.rookie",
    badgeClass: "border-border bg-muted/40 text-muted-foreground",
    barClass: "bg-muted-foreground/60",
  },
  {
    id: "apprentice",
    min: 1000,
    i18nKey: "rank.tier.apprentice",
    badgeClass: "border-sky-500/40 bg-sky-500/10 text-sky-400",
    barClass: "bg-sky-400",
  },
  {
    id: "club",
    min: 1200,
    i18nKey: "rank.tier.club",
    badgeClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    barClass: "bg-emerald-400",
  },
  {
    id: "challenger",
    min: 1400,
    i18nKey: "rank.tier.challenger",
    badgeClass: "border-teal-400/40 bg-teal-400/10 text-teal-300",
    barClass: "bg-teal-300",
  },
  {
    id: "expert",
    min: 1600,
    i18nKey: "rank.tier.expert",
    badgeClass: "border-primary/40 bg-primary/10 text-primary",
    barClass: "bg-primary",
  },
  {
    id: "master",
    min: 1800,
    i18nKey: "rank.tier.master",
    badgeClass: "border-brass/50 bg-brass/10 text-brass",
    barClass: "bg-brass",
  },
  {
    id: "grandmaster",
    min: 2000,
    i18nKey: "rank.tier.grandmaster",
    badgeClass: "border-orange-500/50 bg-orange-500/10 text-orange-400",
    barClass: "bg-orange-400",
  },
  {
    id: "legend",
    min: 2200,
    i18nKey: "rank.tier.legend",
    badgeClass: "border-red-500/50 bg-red-500/10 text-red-400",
    barClass: "bg-red-400",
  },
] as const;

/** RD at or above this means the rating is still highly uncertain. */
export const PROVISIONAL_RD = 110;
/** Below this many rated games the tier display carries a "provisional" hint. */
export const PROVISIONAL_GAMES = 8;

export function tierForRating(rating: number): RatingTier {
  let current = RATING_TIERS[0]!;
  for (const tier of RATING_TIERS) {
    if (rating >= tier.min) current = tier;
    else break;
  }
  return current;
}

export function nextTier(tier: RatingTier): RatingTier | null {
  const idx = RATING_TIERS.findIndex((t) => t.id === tier.id);
  return idx >= 0 && idx < RATING_TIERS.length - 1 ? RATING_TIERS[idx + 1]! : null;
}

export interface TierProgress {
  tier: RatingTier;
  next: RatingTier | null;
  /** Points still needed to reach the next tier (0 when at the top). */
  pointsToNext: number;
  /** 0–100 progress across the current tier band. */
  progressPct: number;
}

export function tierProgress(rating: number): TierProgress {
  const tier = tierForRating(rating);
  const next = nextTier(tier);
  if (!next) {
    return { tier, next: null, pointsToNext: 0, progressPct: 100 };
  }
  const span = next.min - tier.min;
  const done = Math.min(Math.max(rating - tier.min, 0), span);
  return {
    tier,
    next,
    pointsToNext: Math.max(next.min - rating, 0),
    progressPct: Math.round((done / span) * 100),
  };
}

export function isProvisional(ratingDeviation: number, gamesPlayed: number): boolean {
  return ratingDeviation >= PROVISIONAL_RD || gamesPlayed < PROVISIONAL_GAMES;
}
