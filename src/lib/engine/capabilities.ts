/**
 * Engine hardware capabilities — client-safe contract.
 *
 * The values come from the Cloud Run container itself (`/health`), never from
 * a hard-coded assumption in the app. They contain no paths, secrets or env
 * values, so the Admin console can render them directly.
 */
import { engineConfigSchema, TITAN_V6_RECOMMENDED_CONFIG, type EngineConfig } from "./profileTypes";

export interface EngineCapabilities {
  cpuCount: number;
  memoryMb: number;
  poolSize: number;
  maxThreadsPerEngine: number;
  recommendedHashMb: number;
  maxSafeHashMb: number;
  syzygyReady: boolean;
  syzygyPieces: number;
  benchmarkSuiteVersion: string | null;
}

function num(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

/** Defensive parse: a partial or malformed block yields null, never a guess. */
export function parseCapabilities(raw: unknown): EngineCapabilities | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const cpuCount = num(body["cpuCount"]);
  const memoryMb = num(body["memoryMb"]);
  const poolSize = num(body["poolSize"]);
  if (!cpuCount || !memoryMb || !poolSize) return null;
  const suite = body["benchmarkSuiteVersion"];
  return {
    cpuCount,
    memoryMb,
    poolSize,
    maxThreadsPerEngine: num(body["maxThreadsPerEngine"]) ?? Math.max(1, Math.floor(cpuCount / poolSize)),
    recommendedHashMb: num(body["recommendedHashMb"]) ?? Math.max(16, Math.floor(memoryMb / 4)),
    maxSafeHashMb: num(body["maxSafeHashMb"]) ?? Math.max(16, Math.floor(memoryMb / 2)),
    syzygyReady: body["syzygyReady"] === true,
    syzygyPieces: num(body["syzygyPieces"]) ?? 0,
    benchmarkSuiteVersion: typeof suite === "string" && suite ? suite : null,
  };
}

export interface ResourceFit {
  ok: boolean;
  /** Stable codes; `CONFIG_RESOURCE_MISMATCH` is the umbrella error. */
  reasons: string[];
}

/**
 * A config must FIT the hardware. We reject rather than silently clamp, so an
 * admin can never publish a profile whose real behaviour differs from the one
 * that was benchmarked.
 */
export function resourceFit(config: EngineConfig, caps: EngineCapabilities | null): ResourceFit {
  if (!caps) return { ok: false, reasons: ["capabilities_unknown"] };
  const reasons: string[] = [];
  if (config.threads > caps.maxThreadsPerEngine) reasons.push("threads_exceed_cpu");
  if (config.hashMb > caps.maxSafeHashMb) reasons.push("hash_exceeds_memory");
  if (config.syzygyEnabled && !caps.syzygyReady) reasons.push("syzygy_not_installed");
  if (config.syzygyEnabled && config.syzygyPieces > caps.syzygyPieces) reasons.push("syzygy_pieces_overstated");
  if (config.syzygyEnabled && config.syzygyProbeLimit > caps.syzygyPieces) reasons.push("syzygy_probe_overstated");
  return { ok: reasons.length === 0, reasons };
}

/**
 * Builds the Titan v6 draft for the hardware that is actually running.
 * Never published automatically — the admin still saves, qualifies, publishes.
 */
export function recommendTitanConfig(caps: EngineCapabilities | null): EngineConfig {
  const base = TITAN_V6_RECOMMENDED_CONFIG;
  if (!caps) return base;
  const threads = Math.max(1, Math.min(base.threads, caps.maxThreadsPerEngine));
  const hashMb = Math.max(16, Math.min(caps.recommendedHashMb, caps.maxSafeHashMb));
  const syzygy = caps.syzygyReady && caps.syzygyPieces >= 3;
  return engineConfigSchema.parse({
    ...base,
    threads,
    hashMb,
    syzygyEnabled: syzygy,
    syzygyPieces: syzygy ? Math.min(caps.syzygyPieces, 7) : 0,
    syzygyProbeLimit: syzygy ? Math.min(caps.syzygyPieces, 7) : 0,
  });
}
