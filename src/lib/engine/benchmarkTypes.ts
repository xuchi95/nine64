/** Client-safe benchmark contracts (no server-only imports). */
export const BENCHMARK_KINDS = ["bench", "speedtest", "epd", "positions", "selfplay"] as const;
export type BenchmarkKind = (typeof BENCHMARK_KINDS)[number];

export interface BenchmarkRow {
  id: string;
  profileSlug: string;
  profileVersion: number;
  kind: BenchmarkKind;
  engineVersion: string;
  hardware: Record<string, unknown>;
  nodes: number | null;
  nps: number | null;
  depth: number | null;
  score: number | null;
  passed: boolean;
  result: Record<string, unknown>;
  createdAt: string;
}
