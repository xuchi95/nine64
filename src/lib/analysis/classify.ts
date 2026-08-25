import { winLoss, moveAccuracyFromLoss } from "./winrate";
import { accuracyWeight } from "./complexity";
import { translate as t } from "@/lib/i18n";

export type MoveLabel =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "miss"
  | "blunder";

export const LABEL_META: Record<MoveLabel, { readonly title: string; tone: string; symbol: string }> = {
  brilliant: { get title() { return t("game.moveLabel.brilliant"); }, tone: "text-accent", symbol: "!!" },
  great: { get title() { return t("game.moveLabel.great"); }, tone: "text-primary", symbol: "!" },
  best: { get title() { return t("game.moveLabel.best"); }, tone: "text-primary", symbol: "★" },
  excellent: { get title() { return t("game.moveLabel.excellent"); }, tone: "text-primary/80", symbol: "" },
  good: { get title() { return t("game.moveLabel.good"); }, tone: "text-muted-foreground", symbol: "" },
  book: { get title() { return t("game.moveLabel.book"); }, tone: "text-muted-foreground", symbol: "▤" },
  inaccuracy: { get title() { return t("game.moveLabel.inaccuracy"); }, tone: "text-warning", symbol: "?!" },
  mistake: { get title() { return t("game.moveLabel.mistake"); }, tone: "text-warning", symbol: "?" },
  miss: { get title() { return t("game.moveLabel.miss"); }, tone: "text-destructive", symbol: "×" },
  blunder: { get title() { return t("game.moveLabel.blunder"); }, tone: "text-destructive", symbol: "??" },
};

export interface ClassifyInput {
  /** Win percent for the mover before the move. */
  before: number;
  /** Win percent for the mover after the move. */
  after: number;
  /** Win percent the mover would have had with the engine's best move. */
  bestAfter: number;
  isBestMove: boolean;
  /** Second-best line result for the mover, when known. */
  secondBestAfter?: number | null;
  /** SEE of the played move (negative = material sacrificed). */
  see?: number;
  complexity: number;
  inBook: boolean;
  /** Position was already winning and a forced win existed. */
  hadWinningTactic?: boolean;
}

export interface Classification {
  label: MoveLabel;
  loss: number;
  accuracy: number;
  weight: number;
}

export function classifyMove(input: ClassifyInput): Classification {
  const loss = winLoss(input.bestAfter, input.after);
  const accuracy = moveAccuracyFromLoss(loss);
  const weight = accuracyWeight(input.complexity);
  const label = pickLabel(input, loss);
  return { label, loss, accuracy, weight };
}

function pickLabel(input: ClassifyInput, loss: number): MoveLabel {
  const { before, after, isBestMove, see = 0, secondBestAfter, inBook } = input;

  // Brilliant: a real material sacrifice that is still the strongest move and
  // keeps the position at least balanced.
  if (isBestMove && see <= -110 && after >= 45 && loss <= 2) return "brilliant";

  // Great: only move that holds the position — every alternative is clearly
  // worse. Book moves never qualify, and a shallow search rarely separates the
  // top lines by this much, so the bar is deliberately high.
  if (
    isBestMove &&
    !inBook &&
    secondBestAfter !== null &&
    secondBestAfter !== undefined &&
    input.bestAfter - secondBestAfter >= 20 &&
    // In already decided positions the gap between lines is meaningless.
    input.bestAfter > 20 &&
    input.bestAfter < 85 &&
    loss <= 1.5
  ) {
    return "great";
  }



  if (inBook && loss <= 4) return "book";
  if (isBestMove || loss <= 0.5) return "best";

  // Missed win: was clearly winning, now no longer winning.
  if (before >= 80 && after < 60) return "miss";
  if (input.hadWinningTactic && before >= 70 && loss >= 12) return "miss";

  if (loss <= 2) return "excellent";
  if (loss <= 5) return "good";
  if (loss <= 10) return "inaccuracy";
  if (loss <= 20) return "mistake";
  return "blunder";
}

export function summarizeLabels(labels: MoveLabel[]): Record<MoveLabel, number> {
  const out = Object.fromEntries(
    (Object.keys(LABEL_META) as MoveLabel[]).map((k) => [k, 0]),
  ) as Record<MoveLabel, number>;
  for (const l of labels) out[l] += 1;
  return out;
}
