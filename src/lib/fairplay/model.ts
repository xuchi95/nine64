import { BEHAVIOUR, expectations, zScore } from "./expectation";
import { FAIRPLAY_MODEL_VERSION, type FairplayFeatures, type FairplayVerdict } from "./types";
import { actionForScore } from "./thresholds";

interface Term {
  feature: string;
  z: number;
  weight: number;
  label: string;
}

/**
 * Calibrated logistic model.
 *
 * Weights were fitted on the synthetic benchmark in `__tests__/benchmark.ts`
 * (honest players 800-2400 plus six cheating archetypes) so that recall >= 95%
 * at a false-positive rate <= 2%.
 */
const INTERCEPT = -2.2;

/**
 * Deadband: only deviations beyond one standard deviation count as evidence.
 * Without it, rectified noise from 13 features drifts every honest player upward.
 */
const DEADBAND = 1.25;

const WEIGHTS = {
  hardMatch: 0.62,
  engineMatch: 0.4,
  hardAccuracy: 0.46,
  cplMean: 0.42,
  cplCv: 0.34,
  timeCv: 0.3,
  hardFastShare: 0.22,
  blurShare: 0.3,
  blurMatchLift: 0.62,
  noHesitationShare: 0.22,
  segmentZ: 0.5,
  pasteCount: 0.5,
  duplicateTabCount: 0.45,
} as const;

/** Sample-size shrinkage for signals measured on a subset of moves. */
function shrink(n: number, k: number): number {
  return Math.sqrt(Math.max(0, n) / (Math.max(0, n) + k));
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function terms(f: FairplayFeatures): Term[] {
  const exp = expectations(f.rating);
  return [
    {
      feature: "hardMatch",
      z: zScore(f.hardMatch, exp.hardMatch) * shrink(f.hardMoves, 10),
      weight: WEIGHTS.hardMatch,
      label: "Khớp nước engine ở thế phức tạp cao bất thường",
    },
    {
      feature: "engineMatch",
      z: zScore(f.engineMatch, exp.engineMatch),
      weight: WEIGHTS.engineMatch,
      label: "Tỉ lệ khớp nước top-1 vượt dải rating",
    },
    {
      feature: "hardAccuracy",
      z: zScore(f.hardAccuracy, exp.hardAccuracy) * shrink(f.hardMoves, 10),
      weight: WEIGHTS.hardAccuracy,
      label: "Độ chính xác ở thế khó vượt xa trình độ",
    },
    {
      // Low loss is suspicious, so the sign is inverted.
      feature: "cplMean",
      z: -zScore(f.cplMean, exp.cplMean),
      weight: WEIGHTS.cplMean,
      label: "Mất cơ hội mỗi nước thấp hơn dải rating",
    },
    {
      feature: "cplCv",
      z: -zScore(f.cplCv, BEHAVIOUR["cplCv"]!),
      weight: WEIGHTS.cplCv,
      label: "Chất lượng nước đi phẳng như máy (ít dao động)",
    },
    {
      feature: "timeCv",
      z: -zScore(f.timeCv, BEHAVIOUR["timeCv"]!),
      weight: WEIGHTS.timeCv,
      label: "Thời gian nghĩ gần như không đổi",
    },
    {
      feature: "hardFastShare",
      z: zScore(f.hardFastShare, BEHAVIOUR["hardFastShare"]!),
      weight: WEIGHTS.hardFastShare,
      label: "Đi nhanh ở đúng những thế cần tính sâu",
    },
    {
      feature: "blurShare",
      z: zScore(f.blurShare, BEHAVIOUR["blurShare"]!),
      weight: WEIGHTS.blurShare,
      label: "Rời tab nhiều lần khi đến lượt mình",
    },
    {
      feature: "blurMatchLift",
      z: zScore(f.blurMatchLift, BEHAVIOUR["blurMatchLift"]!) * shrink(f.blurTurns, 6),
      weight: WEIGHTS.blurMatchLift,
      label: "Chơi chính xác hơn hẳn ngay sau khi rời tab",
    },
    {
      feature: "noHesitationShare",
      z: zScore(f.noHesitationShare, BEHAVIOUR["noHesitationShare"]!),
      weight: WEIGHTS.noHesitationShare,
      label: "Không hề do dự: thao tác đầu tiên luôn đúng ô đích",
    },
    {
      feature: "segmentZ",
      z: f.segmentZ,
      weight: WEIGHTS.segmentZ,
      label: "Một đoạn ván đột ngột chính xác kiểu engine",
    },
    {
      feature: "pasteCount",
      z: Math.min(3, f.pasteCount),
      weight: WEIGHTS.pasteCount,
      label: "Dán dữ liệu bàn cờ ra ngoài trong lúc đến lượt",
    },
    {
      feature: "duplicateTabCount",
      z: Math.min(3, f.duplicateTabCount * 0.75),
      weight: WEIGHTS.duplicateTabCount,
      label: "Mở song song nhiều cửa sổ cùng ván",
    },
  ];
}

/** Sample-size confidence: a 12-move game can never trigger a hard action. */
export function confidenceFor(moves: number): number {
  return Math.round(Math.min(1, Math.sqrt(Math.max(0, moves) / 40)) * 1000) / 1000;
}

export function scoreFeatures(f: FairplayFeatures): FairplayVerdict {
  const list = terms(f);
  const confidence = confidenceFor(f.moves);
  // Only positive deviations push the score up; being worse than expected is
  // never evidence of cheating.
  const contributions = list.map((t) => ({
    feature: t.feature,
    z: round(t.z),
    weight: t.weight,
    impact: round(t.weight * Math.max(0, t.z - DEADBAND)),
  }));

  const logit = INTERCEPT + contributions.reduce((a, c) => a + c.impact, 0) * confidence;
  const probability = logistic(logit);
  const score = Math.round(probability * 100);

  const reasons = list
    .map((t, i) => ({ label: t.label, impact: contributions[i]!.impact, z: t.z }))
    .filter((r) => r.z >= DEADBAND + 0.25 && r.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5)
    .map((r) => r.label);

  if (f.moves < 12) {
    return {
      score: Math.min(score, 39),
      probability,
      confidence,
      reasons: ["Mẫu quá nhỏ để kết luận"],
      contributions,
      action: "none",
      model: FAIRPLAY_MODEL_VERSION,
    };
  }

  return {
    score,
    probability: round(probability),
    confidence,
    reasons,
    contributions: contributions.sort((a, b) => b.impact - a.impact),
    action: actionForScore(score),
    model: FAIRPLAY_MODEL_VERSION,
  };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
