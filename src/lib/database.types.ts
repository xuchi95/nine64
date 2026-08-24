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
export type TimeControl = "blitz1m" | "blitz3m" | "blitz5m" | "rapid10m" | "rapid15m" | "rapid30m";

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
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: "match_found" | "move" | "game_over" | "system";
  title: string;
  body: string;
  data: Record<string, string | number | boolean | null> | null;
  read: boolean;
  created_at: string;
}
