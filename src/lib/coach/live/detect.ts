/**
 * Deterministic trigger engine for the Live Play Coach.
 *
 * Pure functions over engine-provided facts: the same position and the same
 * engine numbers always produce the same decision. The coach stays silent
 * unless one of the documented triggers fires, so it never comments move by
 * move.
 */
import type {
  CoachMode,
  CoachSeverity,
  CoachTriggerKind,
  MoveFacts,
} from "./types";

export interface TriggerDecision {
  kind: CoachTriggerKind;
  severity: CoachSeverity;
  skillKey: string;
  lossCp: number;
}

/** Loss thresholds in centipawns. */
export const LOSS = {
  inaccuracy: 80,
  mistake: 150,
  blunder: 300,
} as const;

/** Anti-nag budget: how often the coach may speak. */
export const CADENCE = {
  /** Minimum user moves between two interventions. */
  cooldownMoves: 2,
  /** Hard ceiling per game, whatever the mode. */
  maxPerGame: 8,
} as const;

const SKILL_BY_ISSUE: Record<string, string> = {
  early_queen: "opening_principles",
  same_piece_twice: "development",
  too_many_pawn_moves: "development",
  king_uncastled: "king_safety",
  undeveloped_pieces: "development",
  trapped_rook: "rook_activity",
  loose_king: "king_safety",
  passive_pieces: "prophylaxis",
};

/** What each mode is allowed to interrupt for. */
function allowed(mode: CoachMode, kind: CoachTriggerKind, severity: CoachSeverity): boolean {
  if (mode === "quiet") return severity === "critical";
  if (mode === "normal") return severity !== "info" || kind === "missed_tactic";
  return true;
}

/**
 * Classifies one user move. Returns `null` when nothing is worth saying.
 *
 * `facts` must come from the rules engine + Stockfish; this function performs
 * no chess reasoning of its own beyond comparing numbers.
 */
export function classifyMove(facts: MoveFacts, mode: CoachMode): TriggerDecision | null {
  const lossCp = Math.max(0, facts.evalBeforeCp - facts.evalAfterCp);
  const walkedIntoMate = facts.mateAgainst !== null && facts.mateAgainst > 0;
  const missedMate = facts.mateBefore !== null && facts.mateBefore > 0 && lossCp >= LOSS.mistake;

  let decision: TriggerDecision | null = null;

  if (walkedIntoMate) {
    decision = { kind: "blunder", severity: "critical", skillKey: "king_safety", lossCp };
  } else if (missedMate) {
    decision = { kind: "missed_tactic", severity: "critical", skillKey: "mating_net", lossCp };
  } else if (lossCp >= LOSS.blunder) {
    decision = {
      kind: facts.hangingSquare ? "hanging_piece" : "blunder",
      severity: "critical",
      skillKey: facts.hangingSquare ? "piece_safety" : "calculation_depth",
      lossCp,
    };
  } else if (facts.bestIsTactic && lossCp >= LOSS.mistake) {
    decision = { kind: "missed_tactic", severity: "major", skillKey: "calculation_depth", lossCp };
  } else if (lossCp >= LOSS.mistake) {
    decision = {
      kind: facts.hangingSquare ? "hanging_piece" : "mistake",
      severity: "major",
      skillKey: facts.hangingSquare ? "piece_safety" : "calculation_depth",
      lossCp,
    };
  } else if (facts.hangingSquare && lossCp >= LOSS.inaccuracy) {
    decision = { kind: "hanging_piece", severity: "info", skillKey: "piece_safety", lossCp };
  } else if (facts.openingIssue) {
    decision = {
      kind: "opening_principle",
      severity: "info",
      skillKey: SKILL_BY_ISSUE[facts.openingIssue] ?? "opening_principles",
      lossCp,
    };
  } else if (facts.strategicIssue) {
    decision = {
      kind: "strategic_lesson",
      severity: "info",
      skillKey: SKILL_BY_ISSUE[facts.strategicIssue] ?? "prophylaxis",
      lossCp,
    };
  }

  if (!decision) return null;
  return allowed(mode, decision.kind, decision.severity) ? decision : null;
}

export interface CadenceState {
  /** Ply index of the previous intervention, or null. */
  lastPlyIndex: number | null;
  /** Interventions already shown in this game. */
  shown: number;
}

/** Anti-nag gate applied after classification. Critical errors ignore cooldown. */
export function passesCadence(
  decision: TriggerDecision,
  state: CadenceState,
  plyIndex: number,
): boolean {
  if (state.shown >= CADENCE.maxPerGame) return false;
  if (decision.severity === "critical") return true;
  if (state.lastPlyIndex === null) return true;
  return plyIndex - state.lastPlyIndex >= CADENCE.cooldownMoves * 2;
}
