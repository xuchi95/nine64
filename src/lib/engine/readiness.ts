/**
 * Publish-readiness rules for engine profiles — pure and client-safe.
 *
 * Two invariants drive everything here:
 *  1. Only the NEWEST run of each required benchmark kind is authoritative.
 *     An older failing run must never keep publishing blocked once a newer
 *     green run for the same kind exists.
 *  2. Readiness is tied to the exact configuration being published through a
 *     server-generated config fingerprint (see `configFingerprint.ts`), so a
 *     benchmark of config A can never approve a materially different config B.
 */
import type { BenchmarkRow } from "./benchmarkTypes";

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
  | "benchmark_engine_busy"
  | "benchmark_no_move"
  | "benchmark_engine_error"
  | "benchmark_stale"
  | "benchmark_config_mismatch"
  | "benchmark_suite_outdated";

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
export function evaluateReadiness(
  rows: BenchmarkRow[],
  signature?: string | null,
  suiteVersion?: string | null,
): ReadinessResult {
  // When publishing a concrete config, first scope to that fingerprint. A
  // newer run for another draft must not hide the latest valid run for the
  // config being published. We still inspect all rows below when no matching
  // run exists so the UI can distinguish mismatch/stale from genuinely
  // missing data.
  const signatureRows = signature ? rows.filter((row) => row.configSignature === signature) : rows;
  // A run produced by an older probe suite cannot approve the current suite:
  // the positions it measured are not the positions we require today.
  const matchingRows = suiteVersion
    ? signatureRows.filter((row) => row.suiteVersion === suiteVersion)
    : signatureRows;
  const latestByKind = latestBenchmarkByKind(matchingRows);
  const latestUnscopedByKind = latestBenchmarkByKind(rows);
  const reasons = new Set<ReadinessReason>();
  const required = {} as Record<RequiredKind, RequiredBenchmarkState>;

  for (const kind of REQUIRED_BENCHMARK_KINDS) {
    const row = latestByKind.get(kind) ?? null;
    const unscopedRow = latestUnscopedByKind.get(kind) ?? null;
    required[kind] = {
      present: Boolean(row),
      passed: Boolean(row?.passed),
      id: row?.id ?? null,
      createdAt: row?.createdAt ?? null,
    };
    if (!row) {
      const staleSuiteRow = suiteVersion ? signatureRows.find((r) => r.kind === kind) : null;
      if (staleSuiteRow) {
        reasons.add("benchmark_suite_outdated");
        continue;
      }
      if (signature && unscopedRow) {
        if (!unscopedRow.configSignature) reasons.add("benchmark_stale");
        else reasons.add("benchmark_config_mismatch");
      } else {
        reasons.add(kind === "bench" ? "missing_bench" : "missing_tactics");
      }
      continue;
    }
    // Execution/rules failures are read ONLY from the authoritative runs and
    // are reported as themselves — a busy pool or a timeout is NEVER reported
    // as a tactical miss.
    const illegal = counter(row, "illegalMoves");
    const timeouts = counter(row, "timeouts");
    const poolBusy = counter(row, "poolBusy");
    const noMove = counter(row, "noMove");
    const engineErrors = counter(row, "engineErrors");
    if (illegal > 0) reasons.add("illegal_moves");
    if (timeouts > 0) reasons.add("benchmark_timeout");
    if (poolBusy > 0) reasons.add("benchmark_engine_busy");
    if (noMove > 0) reasons.add("benchmark_no_move");
    if (engineErrors > 0) reasons.add("benchmark_engine_error");
    const executionFailure = illegal + timeouts + poolBusy + noMove + engineErrors > 0;
    if (!row.passed && !executionFailure) reasons.add(kind === "bench" ? "bench_failed" : "tactics_failed");
    else if (!row.passed && kind === "bench" && reasons.size === 0) reasons.add("bench_failed");
  }

  return {
    ready: reasons.size === 0,
    reasons: [...reasons],
    required,
    latest: [...latestByKind.values()],
  };
}
