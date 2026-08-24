import type { PlyAnalysis } from "@/lib/analysis/types";

export interface FairplaySignals {
  /** Share of moves matching the engine's first choice (0-1). */
  engineMatch: number;
  /** Engine match restricted to complex positions — the discriminating metric. */
  hardMoveMatch: number;
  /** Coefficient of variation of thinking time (low = machine-like). */
  timeCv: number;
  /** Mean accuracy on high-complexity moves. */
  hardAccuracy: number;
  /** Sample size used. */
  moves: number;
}

export interface FairplayReport extends FairplaySignals {
  /** Aggregated z-score based suspicion index (0-100). */
  suspicion: number;
  flags: string[];
}

/** Human population baselines (mean, sd) for each signal. */
const BASELINE = {
  engineMatch: { mean: 0.42, sd: 0.12 },
  hardMoveMatch: { mean: 0.3, sd: 0.13 },
  timeCv: { mean: 0.75, sd: 0.25 },
  hardAccuracy: { mean: 72, sd: 11 },
};

function z(value: number, base: { mean: number; sd: number }): number {
  return (value - base.mean) / base.sd;
}

export function computeSignals(
  plies: PlyAnalysis[],
  color: "w" | "b",
  complexityThreshold = 0.55,
): FairplaySignals {
  const own = plies.filter((p) => p.color === color);
  if (own.length === 0) {
    return { engineMatch: 0, hardMoveMatch: 0, timeCv: 1, hardAccuracy: 0, moves: 0 };
  }
  const matched = own.filter((p) => p.bestUci && p.bestUci === p.uci);
  const hard = own.filter((p) => p.complexity >= complexityThreshold);
  const hardMatched = hard.filter((p) => p.bestUci && p.bestUci === p.uci);
  const times = own.map((p) => p.spentMs ?? null).filter((t): t is number => t !== null && t > 0);
  const mean = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const sd =
    times.length > 1
      ? Math.sqrt(times.reduce((a, t) => a + (t - mean) ** 2, 0) / (times.length - 1))
      : 0;

  return {
    engineMatch: matched.length / own.length,
    hardMoveMatch: hard.length === 0 ? 0 : hardMatched.length / hard.length,
    timeCv: mean === 0 ? 1 : Math.round((sd / mean) * 1000) / 1000,
    hardAccuracy:
      hard.length === 0
        ? 0
        : Math.round((hard.reduce((a, p) => a + p.accuracy, 0) / hard.length) * 10) / 10,
    moves: own.length,
  };
}

export function fairplayReport(signals: FairplaySignals): FairplayReport {
  const flags: string[] = [];
  if (signals.moves < 12) {
    return { ...signals, suspicion: 0, flags: ["Sample too small for a verdict"] };
  }
  const zMatch = z(signals.engineMatch, BASELINE.engineMatch);
  const zHard = z(signals.hardMoveMatch, BASELINE.hardMoveMatch);
  const zTime = -z(signals.timeCv, BASELINE.timeCv); // low variance is suspicious
  const zAcc = z(signals.hardAccuracy, BASELINE.hardAccuracy);

  const composite = 0.2 * zMatch + 0.4 * zHard + 0.15 * zTime + 0.25 * zAcc;
  const suspicion = Math.round(Math.max(0, Math.min(100, 50 + composite * 16)));

  if (zHard > 2) flags.push("Engine-level accuracy in complex positions");
  if (zTime > 2) flags.push("Near-constant move times");
  if (zMatch > 2.5) flags.push("Very high top-1 engine match");
  if (zAcc > 2) flags.push("Accuracy on hard moves far above rating band");

  return { ...signals, suspicion, flags };
}
