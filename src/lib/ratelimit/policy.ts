/**
 * P0.9 — central rate-limit policy table.
 *
 * Client-safe: contains no secrets, only the action -> window/limit mapping so
 * the UI can explain limits to the user. Every value is overridable through an
 * environment variable (`RL_<ACTION>_LIMIT` / `RL_<ACTION>_WINDOW`) read on the
 * server, so policy can be tuned without a deploy of new logic.
 */

export type RateLimitAction =
  | "coach.burst"
  | "coach.daily"
  | "coach.live.burst"
  | "coach.live.daily"
  | "coach.live.monthly"
  | "contact.ip"
  | "contact.email"
  | "auth.ip"
  | "auth.identifier"
  | "matchmaking.join"
  | "matchmaking.leave"
  | "fairplay.report.user"
  | "fairplay.report.game"
  | "fairplay.signals"
  | "profile.update"
  | "notification.action"
  | "titan.session"
  | "titan.move"
  | "engine.benchmark"
  | "openings.explorer";

export interface RateLimitRule {
  /** Rolling window length in seconds. */
  windowSeconds: number;
  /** Maximum allowed requests inside the window. */
  limit: number;
  /** `true` => a limiter outage blocks the request (costly endpoints). */
  failClosed: boolean;
  /** Human hint used in structured logs and admin reporting. */
  scope: string;
}

export const RATE_LIMIT_POLICY: Record<RateLimitAction, RateLimitRule> = {
  // AI Coach — the only endpoint that spends money per call.
  "coach.burst": { windowSeconds: 60, limit: 3, failClosed: true, scope: "user" },
  "coach.daily": { windowSeconds: 86_400, limit: 40, failClosed: true, scope: "user" },

  // Live Play Coach — paid AI restyling only; deterministic coaching is free
  // and keeps working when these limits are exhausted.
  "coach.live.burst": { windowSeconds: 60, limit: 6, failClosed: true, scope: "user" },
  "coach.live.daily": { windowSeconds: 86_400, limit: 60, failClosed: true, scope: "user" },
  "coach.live.monthly": { windowSeconds: 2_592_000, limit: 600, failClosed: true, scope: "user" },

  // Contact form — unauthenticated, spammable, writes to the database.
  "contact.ip": { windowSeconds: 3_600, limit: 5, failClosed: true, scope: "ip-hmac" },
  "contact.email": { windowSeconds: 86_400, limit: 10, failClosed: true, scope: "email-hmac" },

  // Auth attempts (sign-up / login / password reset) gated before Supabase.
  "auth.ip": { windowSeconds: 900, limit: 20, failClosed: true, scope: "ip-hmac" },
  "auth.identifier": { windowSeconds: 900, limit: 8, failClosed: true, scope: "email-hmac" },

  // Matchmaking — generous enough that normal bullet play never trips it.
  "matchmaking.join": { windowSeconds: 60, limit: 30, failClosed: false, scope: "user" },
  "matchmaking.leave": { windowSeconds: 60, limit: 40, failClosed: false, scope: "user" },

  // Fair-play complaints — one report per game, few per day.
  "fairplay.report.user": { windowSeconds: 86_400, limit: 20, failClosed: false, scope: "user" },
  "fairplay.report.game": { windowSeconds: 86_400, limit: 2, failClosed: false, scope: "user+game" },
  "fairplay.signals": { windowSeconds: 60, limit: 30, failClosed: false, scope: "user" },

  // Light hygiene limits.
  "profile.update": { windowSeconds: 600, limit: 15, failClosed: false, scope: "user" },
  "notification.action": { windowSeconds: 60, limit: 120, failClosed: false, scope: "user" },

  // Nine64 Titan — every move burns paid CPU on Cloud Run, so it fails closed.
  "titan.session": { windowSeconds: 3_600, limit: 20, failClosed: true, scope: "user" },
  "titan.move": { windowSeconds: 60, limit: 40, failClosed: true, scope: "user" },
  "engine.benchmark": { windowSeconds: 3_600, limit: 12, failClosed: true, scope: "admin" },

  // Opening Explorer proxy — protects the upstream open database from abuse.
  "openings.explorer": { windowSeconds: 60, limit: 60, failClosed: false, scope: "ip-hmac" },
};

/** Hard ceilings for AI Coach input, enforced before any gateway call. */
export const COACH_INPUT_LIMITS = {
  maxTimelineEntries: 140,
  maxTimelineChars: 12_000,
  maxKeyMoments: 12,
  maxFenChars: 120,
  maxTextField: 200,
  maxTotalPayloadChars: 24_000,
} as const;

/** Server-side output ceilings — never client-controlled. */
export const COACH_MODEL_LIMITS = {
  maxOutputTokens: 1_400,
} as const;

/** Live Play Coach restyling is a single short paragraph. */
export const COACH_LIVE_MODEL_LIMITS = {
  maxOutputTokens: 900,
} as const;
