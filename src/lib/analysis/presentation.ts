/**
 * Presentation helpers for the "deep analysis" experience.
 *
 * This layer NEVER changes engine data — it only decides how much of it a
 * regular player sees by default, and phrases it in natural language.
 */
import { Chess } from "chess.js";
import { translate, type Locale } from "@/lib/i18n";
import type { PlyAnalysis } from "./types";
import type { Motif } from "./motifs";
import type { GamePhase } from "./phase";
import type { MoveLabel } from "./classify";

/** How bad a turning point was, in player-facing terms. */
export type TurningSeverity = "slight" | "lostEdge" | "bigMistake" | "missedWin";

/** Maximum items surfaced by default. */
export const MAX_TURNING_POINTS = 3;
/** Technical layer ceilings. */
export const MAX_TECH_VARIATIONS = 2;
export const MAX_TECH_PLIES = 4;

const SEVERITY_RANK: Record<TurningSeverity, number> = {
  missedWin: 0,
  bigMistake: 1,
  lostEdge: 2,
  slight: 3,
};

const CONSIDERED: MoveLabel[] = ["blunder", "miss", "mistake"];

export function severityOf(label: MoveLabel): TurningSeverity {
  if (label === "miss") return "missedWin";
  if (label === "blunder") return "bigMistake";
  if (label === "mistake") return "lostEdge";
  return "slight";
}

export function severityLabel(severity: TurningSeverity, locale: Locale): string {
  return translate(`analysis.severity.${severity}`, undefined, locale);
}

export function phaseLabel(phase: GamePhase, locale: Locale): string {
  return translate(`analysis.phase.${phase}`, undefined, locale);
}

export function motifPhrase(motif: Motif, locale: Locale): { label: string; hint: string } {
  return {
    label: translate(`analysis.motif.${motif}`, undefined, locale),
    hint: translate(`analysis.motif.${motif}.hint`, undefined, locale),
  };
}

/** Full-move number for a 0-based ply index. */
export function moveNumberOf(plyIndex: number): number {
  return Math.floor(plyIndex / 2) + 1;
}

/**
 * Describes an evaluation with words instead of centipawns.
 * `cp` is from the point of view of `sideToMove`.
 */
export function evalWord(
  cp: number | null,
  mateIn: number | null,
  sideToMove: "w" | "b",
  locale: Locale,
): string {
  if (mateIn !== null && mateIn !== undefined)
    return translate("analysis.evalWord.mate", undefined, locale);
  if (cp === null || cp === undefined)
    return translate("analysis.evalWord.unknown", undefined, locale);
  const white = sideToMove === "w" ? cp : -cp;
  const abs = Math.abs(white);
  if (abs < 50) return translate("analysis.evalWord.balanced", undefined, locale);
  const clear = abs >= 150;
  const key =
    white > 0
      ? clear
        ? "analysis.evalWord.whiteClear"
        : "analysis.evalWord.whiteEdge"
      : clear
        ? "analysis.evalWord.blackClear"
        : "analysis.evalWord.blackEdge";
  return translate(key, undefined, locale);
}

/** "-3.49" / "M4" — only ever shown inside the technical layer. */
export function rawScoreText(cp: number | null, mateIn: number | null): string {
  if (mateIn !== null && mateIn !== undefined) return `M${Math.abs(mateIn)}`;
  if (cp === null || cp === undefined) return "—";
  const pawns = cp / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

export interface TurningPoint {
  ply: PlyAnalysis;
  index: number;
  moveNumber: number;
  severity: TurningSeverity;
}

/**
 * Picks at most three real turning points for one side:
 * blunder / miss / mistake first, then the biggest win-percentage loss.
 */
export function pickTurningPoints(
  plies: PlyAnalysis[] | undefined,
  side: "w" | "b",
  max = MAX_TURNING_POINTS,
): TurningPoint[] {
  const own = (plies ?? []).filter(
    (p) => p.color === side && CONSIDERED.includes(p.label as MoveLabel),
  );
  return own
    .map((ply) => ({
      ply,
      index: ply.index,
      moveNumber: moveNumberOf(ply.index),
      severity: severityOf(ply.label as MoveLabel),
    }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.ply.loss - a.ply.loss,
    )
    .slice(0, max)
    .sort((a, b) => a.index - b.index);
}

/** Deterministic plain-language note, used when the AI coach has nothing. */
export function fallbackExplanation(
  point: TurningPoint,
  locale: Locale,
): { whatHappened: string; betterPlan: string } {
  const { severity, moveNumber, ply } = point;
  let whatHappened = translate(
    `analysis.fallback.${severity}`,
    { n: moveNumber, loss: Math.round(ply.loss) },
    locale,
  );
  const motif = ply.motifs?.[0];
  if (motif) {
    const { label, hint } = motifPhrase(motif, locale);
    whatHappened += translate("analysis.fallback.motif", { motif: label, hint }, locale);
  }
  const betterPlan = translate(`analysis.fallback.plan.${ply.phase}`, undefined, locale);
  return { whatHappened, betterPlan };
}

const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export interface AnalysisFocus {
  plyIndex: number;
  from: string;
  to: string;
}

/**
 * Builds the single arrow shown for a turning point: the engine's best move in
 * the position BEFORE the mistake. Returns null unless the UCI string is valid
 * and legal in the canonical position.
 */
export function focusFromPly(ply: PlyAnalysis): AnalysisFocus | null {
  const uci = ply.variations?.[0]?.uci ?? ply.bestUci ?? null;
  if (!uci || !UCI_RE.test(uci)) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;
  try {
    const chess = new Chess(ply.fenBefore);
    const move = chess.move(promotion ? { from, to, promotion } : { from, to });
    if (!move) return null;
  } catch {
    return null;
  }
  return { plyIndex: ply.index, from, to };
}
