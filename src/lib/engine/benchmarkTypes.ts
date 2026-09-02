/** Client-safe benchmark contracts (no server-only imports). */
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export const BENCHMARK_KINDS = ["bench", "speedtest", "epd", "positions"] as const;
/** Kinds runnable from the benchmark buttons. */
export type BenchmarkKind = (typeof BENCHMARK_KINDS)[number];
/** Any kind that can appear on a stored row (self-play is a regression, not a gate). */
export type BenchmarkRowKind = BenchmarkKind | "selfplay";

export interface BenchmarkRow {
  id: string;
  profileSlug: string;
  profileVersion: number;
  kind: BenchmarkRowKind;
  engineVersion: string;
  hardware: Record<string, Json>;
  nodes: number | null;
  nps: number | null;
  depth: number | null;
  score: number | null;
  passed: boolean;
  result: Record<string, Json>;
  /** Fingerprint of the engine config this run benchmarked (null for legacy rows). */
  configSignature: string | null;
  /** Identity of the probe suite that produced this row (null for legacy rows). */
  suiteVersion: string | null;
  createdAt: string;
}
