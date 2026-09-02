/**
 * Nine64 AI Player Network — shared types (client-safe).
 *
 * Nothing here reveals engine strength internals: the browser only ever learns
 * that an opponent is an AI, its public name, avatar and rating.
 */

export interface PublicAiOpponent {
  profileId: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number | null;
  isAi: true;
}

export type AiTurnCode =
  | "OK"
  | "DISABLED"
  | "GAME_NOT_FOUND"
  | "NOT_AN_AI_GAME"
  | "GAME_NOT_ACTIVE"
  | "NOT_AI_TURN"
  | "STALE_VERSION"
  | "ALREADY_APPLIED"
  | "ENGINE_UNAVAILABLE"
  | "ENGINE_TIMEOUT"
  | "ENGINE_POOL_BUSY"
  | "ENGINE_ILLEGAL_MOVE"
  | "COMMIT_FAILED";

/** Codes that justify a bounded retry rather than ending the game. */
export const AI_TURN_TRANSIENT_CODES: readonly AiTurnCode[] = [
  "ENGINE_UNAVAILABLE",
  "ENGINE_TIMEOUT",
  "ENGINE_POOL_BUSY",
  "ENGINE_ILLEGAL_MOVE",
];

export interface AiTurnResult {
  code: AiTurnCode;
  gameId: string;
  /** Present only on a successful commit. */
  san?: string;
  version?: number;
  thinkMs?: number;
}

/** Reason stored on a game aborted because the AI infrastructure failed. */
export const AI_ENGINE_FAILURE_REASON = "ai_engine_unavailable";
