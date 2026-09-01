/**
 * Publish-readiness rules for engine profiles — pure and client-safe.
 *
 * Two invariants drive everything here:
 *  1. Only the NEWEST run of each required benchmark kind is authoritative.
 *     An older failing run must never keep publishing blocked once a newer
 *     green run for the same kind exists.
 *  2. Readiness is tied to the exact configuration being published through a
 *     deterministic config fingerprint, so a benchmark of config A can never
 *     approve a materially different config B.
 */
import type { BenchmarkRow } from "./benchmarkTypes";
import type { EngineConfig } from "./profileTypes";

/** Benchmark kinds that gate publishing a live, enabled profile. */
export const REQUIRED_BENCHMARK_KINDS = ["bench", "epd"] as const;
export type RequiredKind = (typeof REQUIRED_BENCHMARK_KINDS)[number];

export type ReadinessReason =
  | "missing_bench"
  | "bench_failed"
  | "missing_tactics"
  | "tactics_failed"
  | "illegal_moves"
  | "benchmark_timeout"
  | "benchmark_engine_error"
  | "benchmark_stale"
  | "benchmark_config_mismatch";

export interface RequiredBenchmarkState {
  present: boolean;
  passed: boolean;
  id: string | null;
  createdAt: string | null;
}

export interface ReadinessResult {
  ready: boolean;
  reasons: ReadinessReason[];
  required: Record<RequiredKind, RequiredBenchmarkState>;
  latest: BenchmarkRow[];
}

/** Config fields that materially change engine behaviour or cost profile. */
function fingerprintInput(config: EngineConfig): Array<[string, unknown]> {
  const record = config as unknown as Record<string, unknown>;
  return Object.keys(record)
    .sort()
    .map((key) => [key, record[key]] as [string, unknown]);
}

/** Deterministic, dependency-free fingerprint (FNV-1a, hex). */
export function configSignature(config: EngineConfig): string {
  const json = JSON.stringify(fingerprintInput(config));
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // Second pass over the reversed string widens the fingerprint to 64 bits.
  let hash2 = 0x811c9dc5;
  for (let i = json.length - 1; i >= 0; i -= 1) {
    hash2 ^= json.charCodeAt(i);
    hash2 = Math.imul(hash2, 0x01000193) >>> 0;
  }
  return `${hash.toString(16).padStart(8, "0")}${hash2.toString(16).padStart(8, "0")}`;
}

/** Newest row per benchmark kind. Input order is not trusted. */
export function latestBenchmarkByKind(rows: BenchmarkRow[]): Map<string, BenchmarkRow> {
  const out = new Map<string, BenchmarkRow>();
  for (const row of rows) {
    const current = out.get(row.kind);
    if (!current || Date.parse(row.createdAt) > Date.parse(current.createdAt)) out.set(row.kind, row);
  }
  return out;
}

function counter(row: BenchmarkRow, key: string): number {
  return Number(row.result[key] ?? 0);
}

/**
 * Evaluate readiness from raw rows. When `signature` is given, the authoritative
 * runs must carry that exact fingerprint.
 */
export function evaluateReadiness(rows: BenchmarkRow[], signature?: string | null): ReadinessResult {
  const latestByKind = latestBenchmarkByKind(rows);
  const reasons = new Set<ReadinessReason>();
  const required = {} as Record<RequiredKind, RequiredBenchmarkState>;

  for (const kind of REQUIRED_BENCHMARK_KINDS) {
    const row = latestByKind.get(kind) ?? null;
    required[kind] = {
      present: Boolean(row),
      passed: Boolean(row?.passed),
      id: row?.id ?? null,
      createdAt: row?.createdAt ?? null,
    };
    if (!row) {
      reasons.add(kind === "bench" ? "missing_bench" : "missing_tactics");
      continue;
    }
    if (signature) {
      if (!row.configSignature) reasons.add("benchmark_stale");
      else if (row.configSignature !== signature) reasons.add("benchmark_config_mismatch");
    }
    if (!row.passed) reasons.add(kind === "bench" ? "bench_failed" : "tactics_failed");
    // Execution/rules failures are read ONLY from the authoritative runs.
    if (counter(row, "illegalMoves") > 0) reasons.add("illegal_moves");
    if (counter(row, "timeouts") > 0) reasons.add("benchmark_timeout");
    if (counter(row, "engineErrors") > 0 || counter(row, "noMove") > 0) reasons.add("benchmark_engine_error");
  }

  return {
    ready: reasons.size === 0,
    reasons: [...reasons],
    required,
    latest: [...latestByKind.values()],
  };
}
