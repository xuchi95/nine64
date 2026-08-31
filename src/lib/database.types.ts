export type AppRole = "admin" | "moderator" | "user";

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export type GameStatus = "pending" | "active" | "completed" | "aborted";
export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";
/**
 * Any control the database `tc_spec()` accepts: the legacy ids, the generic
 * `base+increment` form (e.g. "180+2") and correspondence ("daily3").
 */
export type TimeControl = string;
export type GamePace = "realtime" | "daily";
export type RatingPoolName =
  | "bullet"
  | "blitz"
  | "rapid"
  | "classical"
  | "daily"
  | "chess960";

export interface Game {
  id: string;
  white_id: string;
  black_id: string;
  white_rating: number;
  black_rating: number;
  variant: string;
  time_control: TimeControl;
  status: GameStatus;
  result: GameResult;
  winner_id: string | null;
  end_reason: string | null;
  initial_fen: string;
  current_fen: string;
  white_time_ms: number;
  black_time_ms: number;
  last_move_at: string | null;
  created_at: string;
  updated_at: string;
  /** Monotonic canonical state counter, incremented by the server on every move. */
  version: number;
  /** Server timestamp the active side's turn started (canonical clock anchor). */
  turn_started_at: string | null;
  clock_state: "not_started" | "running" | "stopped";
  /** Canonical increment credited by the server after a legal move. */
  increment_ms: number;
  /** Whether the result feeds a rating pool. */
  rated: boolean;
  /** Realtime clock or correspondence (daily) pacing. */
  pace: GamePace;
  /** Rating pool the result is booked into. */
  pool: RatingPoolName;
  /** Correspondence budget per move, in ms (0 for realtime games). */
  daily_move_ms: number;
  /** Correspondence deadline for the side to move. */
  deadline_at: string | null;
  /** Casual-only: both players may agree to undo the last move. */
  allow_takeback: boolean;
  takeback_count: number;
  /** Spectator visibility and broadcast delay. */
  spectate: "public" | "private";
  spectator_delay_seconds: number;
  rematch_of: string | null;
  challenge_id: string | null;
  white_seen_at: string | null;
  black_seen_at: string | null;
}

export interface GameMove {
  id: number;
  game_id: string;
  move_number: number;
  san: string;
  uci: string;
  fen: string;
  white_time_ms: number;
  black_time_ms: number;
  created_at: string;
}

export type QueueStatus = "waiting" | "matched" | "cancelled";

export interface MatchmakingQueue {
  id: string;
  user_id: string;
  rating: number;
  variant: string;
  time_control: TimeControl;
  status: QueueStatus;
  matched_game_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Canonical notification event types, emitted by the server-side outbox. */
export type NotificationEventType =
  | "game_started"
  | "match_found"
  | "match_declined"
  | "opponent_move"
  | "move"
  | "draw_offered"
  | "draw_accepted"
  | "draw_declined"
  | "game_completed"
  | "game_over"
  | "system";

/** Canonical payload shape: always snake_case, always the same keys. */
export interface NotificationPayload {
  event_type?: NotificationEventType;
  game_id?: string | null;
  actor_id?: string | null;
  url?: string | null;
  [key: string]: string | number | boolean | null | undefined;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationEventType;
  title: string;
  body: string;
  data: NotificationPayload | null;
  event_key: string | null;
  read: boolean;
  created_at: string;
}

export type NotificationOutboxStatus = "queued" | "processing" | "delivered" | "failed";

export interface NotificationOutboxEvent {
  id: string;
  event_type: NotificationEventType;
  event_key: string;
  schema_version: number;
  game_id: string | null;
  actor_id: string | null;
  recipient_id: string;
  payload: NotificationPayload;
  status: NotificationOutboxStatus;
  attempts: number;
  max_attempts: number;
  available_at: string;
  processed_at: string | null;
  last_error: string | null;
  created_at: string;
}

export type DrawOfferStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";

export interface DrawOffer {
  id: string;
  game_id: string;
  offered_by: string;
  offered_to: string;
  status: DrawOfferStatus;
  game_version: number;
  idempotency_key: string;
  created_at: string;
  responded_at: string | null;
  expires_at: string;
}
