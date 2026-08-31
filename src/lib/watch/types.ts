/**
 * Watch Center shared types.
 *
 * Client-safe: no server imports. The canonical broadcast state always comes
 * from the database — spectator-side features (flip, local engine, jumping
 * through moves) never write back into these shapes.
 */

export type EventStatus = "upcoming" | "live" | "finished" | "cancelled";
export type EventGameStatus = "scheduled" | "live" | "finished";
export type BroadcastSourceKind = "pgn_push" | "pgn_url" | "manual";
export type SourceStatus = "active" | "paused" | "error";
export type NewsStatus = "draft" | "published" | "rejected";

export interface BroadcastMove {
  ply: number;
  san: string;
  uci: string;
  fen: string;
  /** Remaining clock for the side that just moved, if the source provides it. */
  clockMs?: number;
  evalCp?: number;
  evalMate?: number;
}

export interface EventSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  location: string | null;
  timeZone: string;
  startsAt: string;
  endsAt: string | null;
  status: EventStatus;
  tour: string | null;
  officialUrl: string | null;
  imageUrl: string | null;
  roundsTotal: number;
  featured: boolean;
  liveGames?: number;
}

export interface EventRound {
  id: string;
  number: number;
  name: string | null;
  startsAt: string | null;
  status: EventGameStatus;
}

export interface EventPlayer {
  id: string;
  slug: string;
  name: string;
  title: string | null;
  federation: string | null;
  rating: number | null;
  fideId: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

export interface BroadcastGameSummary {
  id: string;
  eventId: string;
  eventSlug: string;
  eventName: string;
  roundNumber: number | null;
  board: number;
  whiteName: string;
  blackName: string;
  whiteTitle: string | null;
  blackTitle: string | null;
  whiteRating: number | null;
  blackRating: number | null;
  status: EventGameStatus;
  result: string;
  currentFen: string;
  plyCount: number;
  eco: string | null;
  openingName: string | null;
  whiteClockMs: number | null;
  blackClockMs: number | null;
  evalCp: number | null;
  evalMate: number | null;
  lastMoveAt: string | null;
}

export interface BroadcastGameDetail extends BroadcastGameSummary {
  startFen: string | null;
  moves: BroadcastMove[];
  pgn: string | null;
  termination: string | null;
  startedAt: string | null;
  timeZone: string;
}

export interface NewsCard {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  imageUrl: string | null;
  externalUrl: string | null;
  sourceName: string;
  author: string | null;
  language: string;
  tags: string[];
  publishedAt: string;
}

export interface NewsArticleDetail extends NewsCard {
  contentHtml: string | null;
  sourceHomepage: string | null;
  eventSlug: string | null;
  eventName: string | null;
}

export interface SourceHealth {
  id: string;
  name: string;
  kind: string;
  status: SourceStatus;
  url: string | null;
  eventSlug: string | null;
  eventName: string | null;
  pollIntervalSeconds: number;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  hasToken: boolean;
}

export interface IngestionJobRow {
  id: string;
  kind: "broadcast" | "news";
  sourceId: string | null;
  sourceName: string | null;
  status: "ok" | "failed";
  itemsProcessed: number;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}
