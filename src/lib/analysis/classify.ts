import { winLoss, moveAccuracyFromLoss } from "./winrate";
import { accuracyWeight } from "./complexity";

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

export const LABEL_META: Record<MoveLabel, { title: string; tone: string; symbol: string }> = {
  brilliant: { title: "Brilliant", tone: "text-accent", symbol: "!!" },
  great: { title: "Great", tone: "text-primary", symbol: "!" },
  best: { title: "Best", tone: "text-primary", symbol: "★" },
  excellent: { title: "Excellent", tone: "text-primary/80", symbol: "" },
  good: { title: "Good", tone: "text-muted-foreground", symbol: "" },
  book: { title: "Book", tone: "text-muted-foreground", symbol: "▤" },
  inaccuracy: { title: "Inaccuracy", tone: "text-warning", symbol: "?!" },
  mistake: { title: "Mistake", tone: "text-warning", symbol: "?" },
  miss: { title: "Missed win", tone: "text-destructive", symbol: "×" },
  blunder: { title: "Blunder", tone: "text-destructive", symbol: "??" },
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

  // Great: only move that holds the position — every alternative is much worse.
  if (
    isBestMove &&
    secondBestAfter !== null &&
    secondBestAfter !== undefined &&
    after - secondBestAfter >= 12 &&
    loss <= 2
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
