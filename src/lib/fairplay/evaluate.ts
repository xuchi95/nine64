import type { PlyAnalysis } from "@/lib/analysis/types";
import { engineSignals, toObservations } from "./engineProfile";
import { behaviourSignals } from "./signals";
import { detectSegment } from "./segments";
import { scoreFeatures } from "./model";
import type {
  FairplayColor,
  FairplayFeatures,
  FairplayVerdict,
  MoveObservation,
  TurnTelemetry,
} from "./types";

export interface EvaluateInput {
  plies?: PlyAnalysis[];
  observations?: MoveObservation[];
  turns?: TurnTelemetry[];
  color?: FairplayColor;
  rating: number;
}

export interface FairplayEvaluation extends FairplayVerdict {
  features: FairplayFeatures;
  segment: ReturnType<typeof detectSegment>;
}

/** One-shot per-game evaluation: features + calibrated score + action. */
export function evaluateGame(input: EvaluateInput): FairplayEvaluation {
  const observations =
    input.observations ?? toObservations(input.plies ?? [], input.color ?? "w");
  const engine = engineSignals(observations);
  const behaviour = behaviourSignals(input.turns ?? [], observations);
  const segment = detectSegment(observations);

  const features: FairplayFeatures = {
    moves: engine.moves,
    hardMoves: engine.hardMoves,
    blurTurns: behaviour.blurTurns,
    rating: input.rating,
    engineMatch: engine.engineMatch,
    hardMatch: engine.hardMatch,
    hardAccuracy: engine.hardAccuracy,
    cplMean: engine.cplMean,
    cplCv: engine.cplCv,
    timeCv: behaviour.timeCv,
    hardFastShare: behaviour.hardFastShare,
    blurShare: behaviour.blurShare,
    blurMatchLift: behaviour.blurMatchLift,
    noHesitationShare: behaviour.noHesitationShare,
    pasteCount: behaviour.pasteCount,
    duplicateTabCount: behaviour.duplicateTabCount,
    segmentZ: segment.z,
  };

  return { ...scoreFeatures(features), features, segment };
}

export * from "./types";
export { THRESHOLDS, actionLabel, actionMessage, ACTION_TONE, actionForScore } from "./thresholds";
export { sprt, SPRT_BOUNDS } from "./sprt";
export { detectCollusion } from "./collusion";
export { scoreFeatures, confidenceFor } from "./model";
export { engineSignals, toObservations } from "./engineProfile";
export { behaviourSignals } from "./signals";
export { detectSegment } from "./segments";
