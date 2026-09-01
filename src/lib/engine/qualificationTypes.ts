/** Client-safe contracts for the Titan production qualification suite. */
import type { BenchmarkRow } from "./benchmarkTypes";
import type { ReadinessResult } from "./readiness";

export const QUALIFICATION_STEPS = [
  "preflight",
  "bench",
  "speedtest",
  "epd",
  "positions",
  "selfplay",
] as const;
export type QualificationStepId = (typeof QUALIFICATION_STEPS)[number];

export interface QualificationStep {
  id: QualificationStepId;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  engineVersion: string | null;
  nps: number | null;
  depth: number | null;
  score: number | null;
  benchmarkId: string | null;
  /** Machine-readable failure/skip reason; never contains secrets. */
  reason: string | null;
}

export interface QualificationResult {
  ok: boolean;
  configSignature: string;
  steps: QualificationStep[];
  reasons: string[];
  readiness: ReadinessResult | null;
  rows: BenchmarkRow[];
  durationMs: number;
}
