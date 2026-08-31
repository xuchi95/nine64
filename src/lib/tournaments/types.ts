/**
 * Nine64 tournament domain types.
 *
 * Everything here is pure data: the pairing and scoring modules are written as
 * deterministic functions over these shapes so they can be unit tested without
 * a database, and so the server engine and the UI agree on one vocabulary.
 */

export type TournamentFormat = "arena" | "swiss" | "round_robin" | "knockout";

export type TournamentStatus =
  | "draft"
  | "scheduled"
  | "registration"
  | "running"
  | "finished"
  | "cancelled";

export type TiebreakId = "buchholz" | "sonneborn_berger" | "wins" | "rating";

export type PairingStatus = "pending" | "active" | "finished" | "bye" | "void";
export type PairingResult = "white" | "black" | "draw" | "bye" | "void";
export type Outcome = "win" | "draw" | "loss" | "bye" | "void";

/**
 * Nine64 scoring configuration — fully documented and configurable, and
 * deliberately not a clone of any proprietary operator's scoring table.
 *
 * - `win`/`draw`/`loss`/`bye` are the base points for a finished pairing.
 * - The streak rule multiplies the *base* points of a win (and of a draw when
 *   `applyToDraw`) once a player has already won `streakThreshold` games in a
 *   row inside this tournament. The multiplier never exceeds `streakMax`.
 */
export interface ScoringConfig {
  win: number;
  draw: number;
  loss: number;
  bye: number;
  streakEnabled: boolean;
  /** Consecutive wins required before the multiplier kicks in. */
  streakThreshold: number;
  /** Multiplier applied per streak step beyond the threshold. */
  streakStep: number;
  /** Hard cap on the multiplier. */
  streakMax: number;
  applyToDraw: boolean;
}

/** Arena default: fast games, streaks rewarded, documented and adjustable. */
export const DEFAULT_ARENA_SCORING: ScoringConfig = {
  win: 2,
  draw: 1,
  loss: 0,
  bye: 2,
  streakEnabled: true,
  streakThreshold: 2,
  streakStep: 1,
  streakMax: 2,
  applyToDraw: false,
};

/** Classical default for Swiss, round robin and knockout. */
export const DEFAULT_CLASSICAL_SCORING: ScoringConfig = {
  win: 1,
  draw: 0.5,
  loss: 0,
  bye: 1,
  streakEnabled: false,
  streakThreshold: 0,
  streakStep: 0,
  streakMax: 1,
  applyToDraw: false,
};

export function defaultScoringFor(format: TournamentFormat): ScoringConfig {
  return format === "arena" ? { ...DEFAULT_ARENA_SCORING } : { ...DEFAULT_CLASSICAL_SCORING };
}

export function resolveScoring(
  format: TournamentFormat,
  raw: Partial<ScoringConfig> | null | undefined,
): ScoringConfig {
  return { ...defaultScoringFor(format), ...(raw ?? {}) };
}

/** A player as the pairing algorithms see them. */
export interface PairingPlayer {
  userId: string;
  /** Current tournament score, used for Swiss and arena ordering. */
  score: number;
  rating: number;
  /** Registration order / bracket seed; lower is stronger for knockout. */
  seed: number;
  /** whites minus blacks so far; positive means the player owes a black. */
  colourBalance: number;
  /** Colour of the player's previous game, if any. */
  lastColour: "w" | "b" | null;
  byes: number;
  /** Opponents already faced, for rematch avoidance. */
  opponents: string[];
  active: boolean;
}

export interface PairingSlot {
  board: number;
  whiteId: string | null;
  blackId: string | null;
  status: PairingStatus;
  result: PairingResult | null;
  bracketSlot?: number | null;
}

export interface StandingRow {
  userId: string;
  rank: number;
  score: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  byes: number;
  streak: number;
  colourBalance: number;
  eliminatedRound: number | null;
  tiebreak: Record<string, number>;
}

export const TOURNAMENT_FORMATS: readonly TournamentFormat[] = [
  "arena",
  "swiss",
  "round_robin",
  "knockout",
];
