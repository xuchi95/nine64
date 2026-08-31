/**
 * Deterministic skill detection.
 *
 * Input is engine output only (PlyAnalysis: classification, motifs, phase,
 * clock). Output is a list of skill events with a stable `eventKey`, so
 * re-reviewing the same game never grants XP twice. No language model is
 * involved at any point — the AI layer may only describe what this produced.
 */
import { Chess } from "chess.js";
import type { PlyAnalysis } from "@/lib/analysis/types";
import type { Motif } from "@/lib/analysis/motifs";
import { isSkillKey, type SkillKey } from "./catalog";

export type SkillOutcome = "positive" | "negative" | "neutral";

export interface SkillEventDraft {
  skillKey: SkillKey;
  outcome: SkillOutcome;
  source: "review" | "puzzle" | "drill" | "retry";
  gameId: string;
  ply: number;
  /** Stable identity: same game + ply + skill + outcome collapses to one row. */
  eventKey: string;
  detail: { san: string; label: string; phase: string };
}

const MOTIF_SKILL: Partial<Record<Motif, SkillKey>> = {
  fork: "fork",
  pin: "pin",
  skewer: "skewer",
  discovered: "discovered_attack",
  "mate-net": "mating_net",
  "back-rank": "mating_net",
  hanging: "piece_safety",
  promotion: "passed_pawn",
};

const GOOD_LABELS = new Set(["brilliant", "great", "best", "excellent"]);
const BAD_LABELS = new Set(["mistake", "blunder", "miss"]);

/** Losing this much win% counts as failing the skill that the move touched. */
const NEGATIVE_LOSS = 10;
/** Spending this share of a move's think time without gain = time trouble. */
const SLOW_MOVE_MS = 45_000;
const RUSHED_MOVE_MS = 1_500;

function pieceCount(fen: string): number {
  const board = fen.split(" ")[0] ?? "";
  return [...board].filter((c) => /[a-zA-Z]/.test(c)).length;
}

function isDevelopingMove(san: string, moveNumber: number): boolean {
  return moveNumber <= 12 && /^[NB]/.test(san);
}

function isCastle(san: string): boolean {
  return san.startsWith("O-O");
}

function isCentralPawn(san: string, moveNumber: number): boolean {
  return moveNumber <= 10 && /^[de][45]$/.test(san);
}

function isRookActivation(san: string, phase: string): boolean {
  return phase !== "opening" && /^R/.test(san);
}

function isKingMove(san: string): boolean {
  return /^K/.test(san) && !san.startsWith("O-O");
}

/**
 * Derive the skills a single reviewed ply exercised, together with whether the
 * player demonstrated or failed them.
 */
export function skillsForPly(ply: PlyAnalysis): { key: SkillKey; outcome: SkillOutcome }[] {
  const out: { key: SkillKey; outcome: SkillOutcome }[] = [];
  const good = GOOD_LABELS.has(ply.label);
  const bad = BAD_LABELS.has(ply.label) || ply.loss >= NEGATIVE_LOSS;
  const verdict: SkillOutcome = good ? "positive" : bad ? "negative" : "neutral";
  const moveNumber = Math.floor(ply.index / 2) + 1;

  const add = (key: SkillKey, outcome: SkillOutcome = verdict) => {
    if (!isSkillKey(key)) return;
    if (!out.some((e) => e.key === key)) out.push({ key, outcome });
  };

  // Tactical motifs are engine-detected geometry, not opinions.
  for (const motif of ply.motifs) {
    const key = MOTIF_SKILL[motif];
    if (key) add(key);
  }

  // Fundamentals / opening.
  if (isDevelopingMove(ply.san, moveNumber)) add("development");
  if (isCastle(ply.san)) add("king_safety", good || !bad ? "positive" : "negative");
  if (isCentralPawn(ply.san, moveNumber)) add("center_control");
  if (ply.phase === "opening") add("opening_principles");
  if (ply.phase === "opening" && moveNumber <= 8 && bad) add("opening_repertoire", "negative");

  // Strategy.
  if (isRookActivation(ply.san, ply.phase)) add("rook_activity");
  if (/^[a-h][2-7]$/.test(ply.san) && ply.phase === "middlegame") add("pawn_structure");
  if (good && ply.loss <= 1 && ply.complexity >= 0.6) add("prophylaxis", "positive");

  // Endgame.
  if (ply.phase === "endgame") {
    if (isKingMove(ply.san)) add("king_opposition");
    if (/^[a-h][1-8]=?/.test(ply.san)) add("passed_pawn");
    if (pieceCount(ply.fenBefore) <= 12) add("conversion");
  }

  // Calculation & defence.
  if (ply.complexity >= 0.65) add("calculation_depth");
  if (bad && ply.see < 0) add("piece_safety", "negative");
  if (ply.motifs.length === 0 && ply.complexity >= 0.5 && bad) add("defence", "negative");

  // Clock discipline: only when the review actually captured timings.
  if (typeof ply.spentMs === "number") {
    if (ply.spentMs >= SLOW_MOVE_MS && bad) add("time_management", "negative");
    else if (ply.spentMs <= RUSHED_MOVE_MS && bad) add("time_management", "negative");
    else if (ply.spentMs >= 4_000 && good) add("time_management", "positive");
  }

  return out.filter((e) => e.outcome !== "neutral");
}

export interface DetectOptions {
  gameId: string;
  plies: PlyAnalysis[];
  /** Only plies of this colour count; null reviews both sides. */
  perspective: "w" | "b" | null;
  source?: SkillEventDraft["source"];
}

export function detectSkillEvents({
  gameId,
  plies,
  perspective,
  source = "review",
}: DetectOptions): SkillEventDraft[] {
  const drafts: SkillEventDraft[] = [];
  const seen = new Set<string>();

  for (const ply of plies) {
    if (perspective && ply.color !== perspective) continue;
    for (const { key, outcome } of skillsForPly(ply)) {
      const eventKey = `${gameId}:${ply.index}:${key}:${outcome}`;
      if (seen.has(eventKey)) continue;
      seen.add(eventKey);
      drafts.push({
        skillKey: key,
        outcome,
        source,
        gameId,
        ply: ply.index,
        eventKey,
        detail: { san: ply.san, label: ply.label, phase: ply.phase },
      });
    }
  }
  return drafts;
}

/** A solved retry position awards the skill the mistake failed. */
export function retrySkillEvent(
  gameId: string,
  ply: PlyAnalysis,
  skillKey: SkillKey,
): SkillEventDraft {
  return {
    skillKey,
    outcome: "positive",
    source: "retry",
    gameId,
    ply: ply.index,
    eventKey: `${gameId}:${ply.index}:${skillKey}:retry`,
    detail: { san: ply.san, label: ply.label, phase: ply.phase },
  };
}

/** Legality helper shared by the retry and what-if labs. */
export function legalSanFor(fen: string, from: string, to: string, promotion = "q"): string | null {
  const chess = new Chess();
  try {
    chess.load(fen);
    const move = chess.move({ from, to, promotion });
    return move?.san ?? null;
  } catch {
    return null;
  }
}
