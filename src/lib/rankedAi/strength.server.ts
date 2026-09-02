/**
 * Ranked-AI strength mapping — SERVER ONLY.
 *
 * Produces a throwaway `EngineConfig` for ONE request. It never reads, writes
 * or mutates the Titan profile: Titan keeps its full-strength publish
 * invariant, and ranked AI is a separate subsystem that simply asks the same
 * cloud engine for a weaker search.
 *
 * Two regimes, because Stockfish's own Elo limiter stops at 1320:
 *  - rating >= 1320 → `UCI_LimitStrength` + `UCI_Elo` (the native, calibrated
 *    way to cap strength),
 *  - rating <  1320 → Skill Level plus a hard depth/node/movetime cap.
 *
 * Resource footprint is deliberately tiny (1 thread, 64-256 MB hash, MultiPV 1)
 * so a hundred concurrent AI games cannot exhaust the Cloud Run pool.
 */
import { engineConfigSchema, type EngineConfig } from "@/lib/engine/profileTypes";

export const RANKED_AI_MIN_RATING = 700;
export const RANKED_AI_MAX_RATING = 3190;
/** Stockfish refuses to model an Elo below this; below it we use Skill Level. */
export const UCI_ELO_FLOOR = 1320;

export interface RankedAiStrengthInput {
  rating: number;
  /** Canonical pace from `tc_spec()`. */
  pace: "realtime" | "daily";
  /** Base time in ms (0 for daily). */
  baseMs: number;
  /** Increment in ms. */
  incMs: number;
  variant: "standard" | "chess960";
}

export interface SubEloBand {
  maxRating: number;
  skill: number;
  depth: number;
  nodes: number;
  moveTimeMs: number;
}

/**
 * Calibration bands for the sub-1320 range. These are intentionally
 * conservative and are NOT a claim of exact Elo: they bound the search hard
 * enough that the AI plays recognisably club-level chess at the low end.
 */
export const SUB_ELO_BANDS: readonly SubEloBand[] = [
  { maxRating: 899, skill: 0, depth: 2, nodes: 20_000, moveTimeMs: 200 },
  { maxRating: 1099, skill: 1, depth: 3, nodes: 40_000, moveTimeMs: 300 },
  { maxRating: 1199, skill: 2, depth: 4, nodes: 80_000, moveTimeMs: 400 },
  { maxRating: 1259, skill: 3, depth: 5, nodes: 120_000, moveTimeMs: 500 },
  { maxRating: 1319, skill: 5, depth: 6, nodes: 180_000, moveTimeMs: 600 },
];

export function clampRating(rating: number): number {
  if (!Number.isFinite(rating)) return 1200;
  return Math.min(RANKED_AI_MAX_RATING, Math.max(RANKED_AI_MIN_RATING, Math.round(rating)));
}

export function subEloBandFor(rating: number): SubEloBand {
  const clamped = clampRating(rating);
  for (const band of SUB_ELO_BANDS) if (clamped <= band.maxRating) return band;
  return SUB_ELO_BANDS[SUB_ELO_BANDS.length - 1]!;
}

/** Roster bookkeeping only: which of the 16 bot tiers this rating resembles. */
export function engineLevelForRating(rating: number): number {
  const clamped = clampRating(rating);
  const level = Math.round(1 + ((clamped - RANKED_AI_MIN_RATING) * 14) / (3000 - RANKED_AI_MIN_RATING));
  return Math.min(15, Math.max(1, level));
}

/** Hash size grows a little with strength but never approaches Titan's. */
function hashForRating(rating: number): number {
  if (rating < 1600) return 64;
  if (rating < 2200) return 128;
  return 256;
}

/** Upper bound on how long one AI search may run for this time control. */
export function maxSearchMsFor(input: Pick<RankedAiStrengthInput, "pace" | "baseMs" | "incMs">): number {
  if (input.pace === "daily") return 4_000;
  const budget = Math.round(input.baseMs / 40 + input.incMs * 0.8);
  return Math.min(8_000, Math.max(250, budget));
}

/**
 * Deterministic per-request engine configuration. Always returns a config that
 * satisfies `engineConfigSchema`; it is never persisted anywhere.
 */
export function rankedAiConfigForRating(input: RankedAiStrengthInput): EngineConfig {
  const rating = clampRating(input.rating);
  const maxMoveTimeMs = maxSearchMsFor(input);
  const useNativeElo = rating >= UCI_ELO_FLOOR;
  const band = useNativeElo ? null : subEloBandFor(rating);

  const base = {
    timePolicy: useNativeElo ? ("clock" as const) : ("movetime" as const),
    moveTimeMs: Math.min(maxMoveTimeMs, band ? band.moveTimeMs : Math.max(250, Math.round(maxMoveTimeMs * 0.8))),
    clockFraction: 0.03,
    maxMoveTimeMs,
    depth: band ? band.depth : null,
    nodes: band ? band.nodes : null,

    threads: 1,
    hashMb: hashForRating(rating),
    multiPv: 1,
    ponder: false,
    moveOverheadMs: 200,

    limitStrength: useNativeElo,
    skill: useNativeElo ? 20 : band!.skill,
    uciElo: useNativeElo ? rating : null,

    syzygyEnabled: false,
    syzygyPieces: 0,
    syzygyProbeLimit: 0,

    openingRandomness: 0,
    personalityTolerance: 0,

    perUserDailyMoves: 20_000,
    maxConcurrentGames: 10,
    requestTimeoutMs: Math.min(60_000, maxMoveTimeMs + 15_000),
    maxRetries: 0,
  };

  return engineConfigSchema.parse(base);
}
