/**
 * Client-safe part of the play-engine deployment contract.
 *
 * The Admin UI needs to show which benchmark suite this build requires, so the
 * constant lives here instead of in the server-only contract module.
 * Bump together with `services/play-engine/src/capabilities.js`.
 */
export const EXPECTED_BENCHMARK_SUITE_VERSION = "titan-v6-3";

export type EngineContractCode =
  | "ENGINE_NOT_CONFIGURED"
  | "ENGINE_AUTH_FAILED"
  | "ENGINE_UNAVAILABLE"
  | "ENGINE_POOL_UNAVAILABLE"
  | "ENGINE_VERSION_UNSUPPORTED"
  | "ENGINE_CAPABILITIES_UNAVAILABLE"
  | "ENGINE_BENCHMARK_SUITE_MISMATCH"
  | "CONFIG_RESOURCE_MISMATCH";
