import type { PlyAnalysis } from "@/lib/analysis/types";
import type { FairplayColor, MoveObservation } from "./types";
import { meanOf, sdOf } from "./signals";

export interface EngineSignals {
  moves: number;
  hardMoves: number;
  engineMatch: number;
  hardMatch: number;
  hardAccuracy: number;
  cplMean: number;
  cplCv: number;
}

export const HARD_COMPLEXITY = 0.55;

/** Turn a reviewed game into per-move observations for one side. */
export function toObservations(plies: PlyAnalysis[], color: FairplayColor): MoveObservation[] {
  return plies
    .filter((p) => p.color === color)
    .map((p) => ({
      ply: p.index,
      isTop1: Boolean(p.bestUci && p.bestUci === p.uci),
      loss: p.loss,
      complexity: p.complexity,
      accuracy: p.accuracy,
      spentMs: p.spentMs ?? null,
    }));
}

/**
 * Engine-derived quality signals.
 *
 * `cplCv` matters as much as `cplMean`: humans oscillate between good and bad
 * moves, engine-fed move streams are unnaturally flat even at moderate strength
 * (a cheater throttling to ~1600 keeps a low variance that no human sustains).
 */
export function engineSignals(observations: MoveObservation[]): EngineSignals {
  if (observations.length === 0) {
    return {
      moves: 0,
      hardMoves: 0,
      engineMatch: 0,
      hardMatch: 0,
      hardAccuracy: 0,
      cplMean: 0,
      cplCv: 2,
    };
  }
  const hard = observations.filter((o) => o.complexity >= HARD_COMPLEXITY);
  const losses = observations.map((o) => o.loss);
  const lossMean = meanOf(losses);

  return {
    moves: observations.length,
    hardMoves: hard.length,
    engineMatch: r3(observations.filter((o) => o.isTop1).length / observations.length),
    hardMatch: hard.length === 0 ? 0 : r3(hard.filter((o) => o.isTop1).length / hard.length),
    hardAccuracy: hard.length === 0 ? 0 : r1(meanOf(hard.map((o) => o.accuracy))),
    cplMean: r1(lossMean),
    cplCv: lossMean <= 0.001 ? 0 : r3(sdOf(losses) / lossMean),
  };
}

function r3(v: number) {
  return Math.round(v * 1000) / 1000;
}
function r1(v: number) {
  return Math.round(v * 10) / 10;
}
