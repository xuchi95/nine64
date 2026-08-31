/**
 * Human-first translation of a tablebase verdict.
 *
 * The technical numbers (DTZ/DTM) stay visible for advanced users, but the
 * headline is always plain language: "still winning if you play accurately".
 */
import type { TablebaseOutcome, TablebaseResult } from "./tablebase.server";

export type VerdictTone = "win" | "draw" | "loss" | "unknown";

export interface Verdict {
  tone: VerdictTone;
  /** i18n key for the human sentence. */
  headlineKey: string;
  /** i18n key for the technical footnote (empty when nothing to show). */
  detailKey: string;
  detailParams: Record<string, string | number>;
}

export function verdictOf(result: TablebaseResult | null): Verdict {
  if (!result || !result.available || !result.outcome) {
    const reason = result?.reason ?? "unavailable";
    return {
      tone: "unknown",
      headlineKey:
        reason === "too_many_pieces"
          ? "academy.tb.tooManyPieces"
          : reason === "not_found"
            ? "academy.tb.notFound"
            : "academy.tb.unavailable",
      detailKey: "",
      detailParams: {},
    };
  }
  const tone: VerdictTone =
    result.outcome === "win" || result.outcome === "cursed-win"
      ? "win"
      : result.outcome === "loss" || result.outcome === "blessed-loss"
        ? "loss"
        : "draw";

  const headlineKey =
    result.outcome === "win"
      ? "academy.tb.win"
      : result.outcome === "cursed-win"
        ? "academy.tb.cursedWin"
        : result.outcome === "loss"
          ? "academy.tb.loss"
          : result.outcome === "blessed-loss"
            ? "academy.tb.blessedLoss"
            : "academy.tb.draw";

  const dtz = result.dtz;
  const dtm = result.dtm;
  if (typeof dtm === "number" && dtm !== 0) {
    return {
      tone,
      headlineKey,
      detailKey: "academy.tb.dtm",
      detailParams: { moves: Math.abs(Math.ceil(dtm / 2)) },
    };
  }
  if (typeof dtz === "number" && dtz !== 0) {
    return {
      tone,
      headlineKey,
      detailKey: "academy.tb.dtz",
      detailParams: { plies: Math.abs(dtz) },
    };
  }
  return { tone, headlineKey, detailKey: "", detailParams: {} };
}

/** Whether a move keeps the current winning/drawing verdict (learner feedback). */
export function keepsResult(before: TablebaseOutcome | null, after: TablebaseOutcome | null): boolean {
  if (!before || !after) return true;
  // Child positions are reported from the opponent's point of view.
  const flipped: Record<TablebaseOutcome, TablebaseOutcome> = {
    win: "loss",
    loss: "win",
    draw: "draw",
    "cursed-win": "blessed-loss",
    "blessed-loss": "cursed-win",
  };
  const mine = flipped[after];
  if (before === "win" || before === "cursed-win") return mine === "win" || mine === "cursed-win";
  if (before === "draw") return mine !== "loss" && mine !== "blessed-loss";
  return true;
}
