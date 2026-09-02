/**
 * Engine profile contract — client-safe.
 *
 * Every knob an admin can touch is declared here with a hard range. There is
 * deliberately NO free-form UCI command field: the admin UI can only produce
 * values that pass this schema, and the cloud service only accepts the
 * allowlisted option names below.
 */
import { z } from "zod";

export const ENGINE_RUNTIMES = ["browser", "cloud"] as const;
export type EngineRuntime = (typeof ENGINE_RUNTIMES)[number];

export const ENGINE_PROFILE_STATUS = ["draft", "canary", "published", "disabled"] as const;
export type EngineProfileStatus = (typeof ENGINE_PROFILE_STATUS)[number];

/** The only UCI options the platform will ever set. */
export const ALLOWED_UCI_OPTIONS = [
  "Threads",
  "Hash",
  "MultiPV",
  "Skill Level",
  "UCI_LimitStrength",
  "UCI_Elo",
  "Move Overhead",
  "Ponder",
  "SyzygyPath",
  "SyzygyProbeLimit",
] as const;

export const engineConfigSchema = z.object({
  /** Search budget policy. `clock` uses go wtime/btime/winc/binc. */
  timePolicy: z.enum(["clock", "movetime", "depth", "nodes"]).default("clock"),
  moveTimeMs: z.number().int().min(50).max(60_000).default(4_000),
  /** Fraction of the remaining clock spent on one move when timePolicy=clock. */
  clockFraction: z.number().min(0.005).max(0.2).default(0.04),
  maxMoveTimeMs: z.number().int().min(200).max(120_000).default(12_000),
  depth: z.number().int().min(1).max(60).nullable().default(null),
  nodes: z.number().int().min(10_000).max(2_000_000_000).nullable().default(null),

  threads: z.number().int().min(1).max(64).default(8),
  hashMb: z.number().int().min(16).max(32_768).default(2_048),
  multiPv: z.number().int().min(1).max(5).default(1),
  ponder: z.boolean().default(false),
  moveOverheadMs: z.number().int().min(0).max(5_000).default(300),

  limitStrength: z.boolean().default(false),
  skill: z.number().int().min(0).max(20).nullable().default(20),
  uciElo: z.number().int().min(1320).max(3190).nullable().default(null),

  syzygyEnabled: z.boolean().default(false),
  /** Never advertise more pieces than the tablebase files actually installed. */
  syzygyPieces: z.number().int().min(0).max(7).default(0),
  syzygyProbeLimit: z.number().int().min(0).max(7).default(0),

  openingRandomness: z.number().min(0).max(1).default(0),
  personalityTolerance: z.number().int().min(0).max(200).default(0),

  /** Abuse + cost guards. */
  perUserDailyMoves: z.number().int().min(10).max(20_000).default(600),
  maxConcurrentGames: z.number().int().min(1).max(10).default(2),
  /**
   * DEPRECATED / NOT ENFORCED. Real GCP billing data is not available to this
   * app, so no honest per-day USD cap can be enforced here. Kept only so stored
   * rows keep parsing; it is hidden from the admin UI. The hard blast-radius
   * control is the Cloud Run `--max-instances` limit, plus the enforced
   * `perUserDailyMoves` quota.
   */
  maxCostPerDayUsd: z.number().min(0).max(1_000).default(0),
  requestTimeoutMs: z.number().int().min(1_000).max(120_000).default(20_000),
  maxRetries: z.number().int().min(0).max(3).default(1),
});

export type EngineConfig = z.infer<typeof engineConfigSchema>;

export interface EngineProfile {
  slug: string;
  name: string;
  runtime: EngineRuntime;
  enabled: boolean;
  isPublic: boolean;
  status: EngineProfileStatus;
  stockfishVersion: string;
  config: EngineConfig;
  draftConfig: EngineConfig;
  hasDraft: boolean;
  version: number;
  reason: string | null;
  publishedAt: string;
  updatedBy: string | null;
}

export const TITAN_SLUG = "titan";
export const TITAN_LEVEL = 16;

/**
 * Code fallback used when the database profile cannot be read. Full strength,
 * no Elo cap, no randomness — identical intent to the published profile.
 */
export const TITAN_FALLBACK_CONFIG: EngineConfig = engineConfigSchema.parse({
  timePolicy: "clock",
  moveTimeMs: 4_000,
  clockFraction: 0.04,
  maxMoveTimeMs: 12_000,
  threads: 8,
  hashMb: 2_048,
  multiPv: 1,
  ponder: false,
  moveOverheadMs: 300,
  limitStrength: false,
  skill: 20,
  uciElo: null,
  openingRandomness: 0,
  personalityTolerance: 0,
});

/**
 * Titan v6 "Max" baseline for a Cloud Run instance with 8 vCPU / 16 GiB and
 * ENGINE_POOL_SIZE=1.
 *
 * - `clock` policy so Stockfish runs its OWN time manager (`go wtime btime …`).
 * - `moveTimeMs` is the untimed/casual budget (12s), `maxMoveTimeMs` (30s) is a
 *   hard outer safety cap enforced by the engine service, not a UCI movetime.
 * - Full strength: no `UCI_LimitStrength`, no Elo cap, Skill 20, MultiPV 1, no
 *   randomness and no personality tolerance.
 * - Ponder stays OFF: Cloud Run is stateless and pondering between requests
 *   would only burn CPU.
 * - Syzygy stays OFF here; it is enabled only when /health proves that real
 *   tablebase files are installed.
 */
export const TITAN_V6_RECOMMENDED_CONFIG: EngineConfig = engineConfigSchema.parse({
  timePolicy: "clock",
  moveTimeMs: 12_000,
  clockFraction: 0.04,
  maxMoveTimeMs: 30_000,
  depth: null,
  nodes: null,
  threads: 8,
  hashMb: 4_096,
  multiPv: 1,
  ponder: false,
  moveOverheadMs: 300,
  limitStrength: false,
  skill: 20,
  uciElo: null,
  syzygyEnabled: false,
  syzygyPieces: 0,
  syzygyProbeLimit: 0,
  openingRandomness: 0,
  personalityTolerance: 0,
  perUserDailyMoves: 600,
  maxConcurrentGames: 2,
  requestTimeoutMs: 45_000,
  maxRetries: 1,
});

export function parseEngineConfig(value: unknown): EngineConfig {
  const parsed = engineConfigSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : TITAN_FALLBACK_CONFIG;
}

/** Competition profiles must never weaken the engine on purpose. */
export function isFullStrength(config: EngineConfig): boolean {
  return titanFullStrengthViolations(config).length === 0;
}

/**
 * Every way a config would make Titan deliberately weaker. Returned as stable
 * machine codes so the publish gate can explain exactly what it rejected.
 */
export function titanFullStrengthViolations(config: EngineConfig): string[] {
  const out: string[] = [];
  if (config.limitStrength) out.push("limit_strength_enabled");
  if (config.uciElo !== null) out.push("uci_elo_capped");
  if (config.skill !== null && config.skill !== 20) out.push("skill_below_max");
  if (config.multiPv !== 1) out.push("multipv_not_1");
  if (config.openingRandomness !== 0) out.push("opening_randomness");
  if (config.personalityTolerance !== 0) out.push("personality_tolerance");
  return out;
}

