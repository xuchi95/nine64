/**
 * Live Play Coach — shared vocabulary.
 *
 * Everything the coach *asserts about chess* (legality, best move, evaluation)
 * comes from the rules engine and Stockfish. The AI layer may only rephrase an
 * already-decided, deterministic explanation.
 */

/** How chatty the coach is allowed to be. */
export type CoachMode = "quiet" | "normal" | "teaching";

export const COACH_MODES: CoachMode[] = ["quiet", "normal", "teaching"];

/** Presentation style only — never changes chess truth. */
export type CoachPersonalityId = "friendly_teacher" | "concise_master" | "socratic_coach";

export const COACH_PERSONALITIES: CoachPersonalityId[] = [
  "friendly_teacher",
  "concise_master",
  "socratic_coach",
];

/** Deterministic reason the coach spoke up. */
export type CoachTriggerKind =
  | "blunder"
  | "missed_tactic"
  | "mistake"
  | "hanging_piece"
  | "opening_principle"
  | "strategic_lesson";

export type CoachSeverity = "info" | "major" | "critical";

/** Facts about the position, computed by the rules engine (never by AI). */
export interface MoveFacts {
  /** 1-based full move number of the played move. */
  moveNumber: number;
  /** 0-based ply index of the played move. */
  plyIndex: number;
  /** SAN of the move the user actually played (from the rules engine). */
  playedSan: string;
  /** Engine best move in app-UCI, or null when the engine gave nothing. */
  bestUci: string | null;
  /** SAN of the engine best move, derived by the rules engine from `bestUci`. */
  bestSan: string | null;
  /** Evaluation before the move, centipawns, from the user's point of view. */
  evalBeforeCp: number;
  /** Evaluation after the move, centipawns, from the user's point of view. */
  evalAfterCp: number;
  /** Mate distance the user had available before moving (positive = user mates). */
  mateBefore: number | null;
  /** Mate distance against the user after the move (positive = user gets mated). */
  mateAgainst: number | null;
  /** Square of the user's most valuable piece left en prise, if any. */
  hangingSquare: string | null;
  /** Piece type sitting on `hangingSquare`. */
  hangingPiece: string | null;
  /** True when the engine's best move was a capture or a forced mate. */
  bestIsTactic: boolean;
  /** Opening-principle violation detected inside the first 20 plies. */
  openingIssue: OpeningIssue | null;
  /** Long-term (non-tactical) lesson worth one sentence. */
  strategicIssue: StrategicIssue | null;
}

export type OpeningIssue =
  | "early_queen"
  | "same_piece_twice"
  | "too_many_pawn_moves"
  | "king_uncastled"
  | "undeveloped_pieces";

export type StrategicIssue = "trapped_rook" | "loose_king" | "passive_pieces";

/** A single coaching intervention, fully determined before any AI call. */
export interface CoachMoment {
  id: string;
  kind: CoachTriggerKind;
  severity: CoachSeverity;
  plyIndex: number;
  moveNumber: number;
  playedSan: string;
  /** Only ever an engine move; the coach never invents one. */
  bestSan: string | null;
  bestUci: string | null;
  lossCp: number;
  /** Skill key credited/debited in the Skill Graph. */
  skillKey: string;
  /** Squares the coach may highlight. */
  highlight: string[];
  /** At most ONE arrow, taken from the engine best move. */
  arrow: { from: string; to: string } | null;
  /** Deterministic body text (always available, AI-free). */
  message: string;
  /** Socratic question shown before the reveal in Teaching mode. */
  question: string | null;
  /** Progressive hint, revealed on demand. */
  hint: string;
  /** True when the position before the move can be retried. */
  retryable: boolean;
}
