/**
 * Deployment contract between the Nine64 backend and `services/play-engine`.
 *
 * A qualification run is only meaningful when the Cloud Run service is the
 * build we expect: same Stockfish major, same benchmark suite, and a
 * capabilities block the backend can actually reason about. This module is the
 * ONE place that decides that, so preflight, benchmarks and the Admin
 * connection check can never disagree.
 *
 * Nothing here reads or returns secrets: only the safe `/health` contract.
 */
import type { EngineConfig } from "./profileTypes";
import type { CloudEngineHealth } from "./cloudEngine.server";
import { resourceFit, type EngineCapabilities, type ResourceFit } from "./capabilities";

import { EXPECTED_BENCHMARK_SUITE_VERSION, type EngineContractCode } from "./engineContractTypes";

export { EXPECTED_BENCHMARK_SUITE_VERSION };
export type { EngineContractCode };

export interface EngineContract {
  ok: boolean;
  code: EngineContractCode | null;
  health: CloudEngineHealth;
  capabilities: EngineCapabilities | null;
  /** Suite the engine really reports; null on an outdated deployment. */
  engineSuiteVersion: string | null;
  expectedSuiteVersion: string;
  serviceBuildId: string | null;
  fit: ResourceFit | null;
}

/** True when every capability field the gates depend on is present and sane. */
export function capabilitiesUsable(caps: EngineCapabilities | null): boolean {
  return Boolean(
    caps &&
      caps.cpuCount > 0 &&
      caps.memoryMb > 0 &&
      caps.poolSize > 0 &&
      caps.maxThreadsPerEngine > 0 &&
      caps.maxSafeHashMb > 0,
  );
}

/**
 * Evaluates the live deployment contract. `config` is optional: without it the
 * resource-fit gate is skipped (used by the plain connection check).
 */
export function evaluateEngineContract(
  health: CloudEngineHealth,
  config?: EngineConfig | null,
): EngineContract {
  const caps = health.capabilities;
  const base = {
    health,
    capabilities: caps,
    engineSuiteVersion: health.benchmarkSuiteVersion,
    expectedSuiteVersion: EXPECTED_BENCHMARK_SUITE_VERSION,
    serviceBuildId: health.serviceBuildId ?? null,
    fit: null as ResourceFit | null,
  };

  if (health.status === "not_configured") return { ...base, ok: false, code: "ENGINE_NOT_CONFIGURED" };
  if (health.status === "unauthorized") return { ...base, ok: false, code: "ENGINE_AUTH_FAILED" };
  if (health.status !== "healthy" && health.status !== "degraded") {
    return { ...base, ok: false, code: "ENGINE_UNAVAILABLE" };
  }
  if (!health.pool || health.pool.size < 1) return { ...base, ok: false, code: "ENGINE_POOL_UNAVAILABLE" };
  if (!/stockfish\s*18/i.test(health.engineVersion ?? "")) {
    return { ...base, ok: false, code: "ENGINE_VERSION_UNSUPPORTED" };
  }
  // An old image reports no capabilities at all: the backend then knows
  // nothing about CPU/RAM/pool and must not benchmark blindly.
  if (!capabilitiesUsable(caps)) return { ...base, ok: false, code: "ENGINE_CAPABILITIES_UNAVAILABLE" };
  // The engine must PROVE it ships the suite we score against.
  if (health.benchmarkSuiteVersion !== EXPECTED_BENCHMARK_SUITE_VERSION) {
    return { ...base, ok: false, code: "ENGINE_BENCHMARK_SUITE_MISMATCH" };
  }
  if (!config) return { ...base, ok: true, code: null };

  const fit = resourceFit(config, caps);
  if (!fit.ok) return { ...base, fit, ok: false, code: "CONFIG_RESOURCE_MISMATCH" };
  return { ...base, fit, ok: true, code: null };
}

/** Fetches live health (uncached) and evaluates the contract. */
export async function checkEngineContract(config?: EngineConfig | null): Promise<EngineContract> {
  const { cloudEngineHealthCached } = await import("./cloudEngine.server");
  return evaluateEngineContract(await cloudEngineHealthCached(0), config ?? null);
}
