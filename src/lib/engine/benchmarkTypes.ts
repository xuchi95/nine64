/** Client-safe benchmark contracts (no server-only imports). */
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export const BENCHMARK_KINDS = ["bench", "speedtest", "epd", "positions", "selfplay"] as const;
export type BenchmarkKind = (typeof BENCHMARK_KINDS)[number];

export interface BenchmarkRow {
  id: string;
  profileSlug: string;
  profileVersion: number;
  kind: BenchmarkKind;
  engineVersion: string;
  hardware: Record<string, Json>;
  nodes: number | null;
  nps: number | null;
  depth: number | null;
  score: number | null;
  passed: boolean;
  result: Record<string, Json>;
  createdAt: string;
}
