/**
 * Client-safe types + constants for the Admin Center user module.
 * No server imports here: routes and components may import this freely.
 */

export const USER_STATUSES = [
  "active",
  "restricted",
  "suspended",
  "pending_deletion",
  "anonymized",
] as const;
export type UserAdminStatus = (typeof USER_STATUSES)[number];

/** Sorting is an allowlist — never interpolate user input into `order()`. */
export const USER_SORT_FIELDS = [
  "created_at",
  "rating",
  "peak_rating",
  "games_played",
  "display_name",
] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];

export const SUSPEND_PRESET_HOURS = [1, 24, 24 * 7, 24 * 30] as const;

/** Suspensions of a week or longer need typed confirmation. */
export const LONG_SUSPENSION_HOURS = 24 * 7;

/** Grace period before an anonymize/delete job may run. */
export const DELETION_GRACE_HOURS = 72;

export interface AdminUserRow {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  emailMasked: string | null;
  emailConfirmed: boolean;
  providers: string[];
  createdAt: string | null;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  role: "admin" | "moderator" | "user";
  status: UserAdminStatus;
  suspendedUntil: string | null;
  stateVersion: number;
  rating: number;
  peakRating: number;
  ratingDeviation: number;
  volatility: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  fairplayAction: string | null;
  fairplayScore: number | null;
  ratingLocked: boolean;
  reportCount: number;
  onlineGames: number;
  lastActivityAt: string | null;
}

export interface AdminUserListResult {
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminUserListInput {
  page?: number;
  pageSize?: number;
  q?: string;
  role?: "admin" | "moderator" | "user" | "any";
  status?: UserAdminStatus | "any";
  fairplay?: "any" | "clean" | "flagged" | "locked";
  ratingMin?: number;
  ratingMax?: number;
  createdFrom?: string;
  createdTo?: string;
  sort?: UserSortField;
  dir?: "asc" | "desc";
}

export interface TimelineEntry {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail?: string | null;
  href?: string | null;
}

export interface AdminUserDetail {
  overview: AdminUserRow & { email: string | null; internalNote: string | null; reason: string | null };
  games: TimelineEntry[];
  ratings: TimelineEntry[];
  adjustments: TimelineEntry[];
  fairplay: TimelineEntry[];
  reports: TimelineEntry[];
  security: TimelineEntry[];
  notifications: TimelineEntry[];
  adminHistory: TimelineEntry[];
  deletionJob: {
    id: string;
    status: string;
    mode: string;
    graceUntil: string;
    reason: string;
  } | null;
}

export type AdminActionResult =
  | { ok: true; code?: string; message?: string; state?: { version: number; status: UserAdminStatus } }
  | { ok: false; code: string; message: string };

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [name, domain] = email.split("@");
  if (!domain || !name) return "•••";
  const head = name.slice(0, 2);
  return `${head}${"•".repeat(Math.max(2, name.length - 2))}@${domain}`;
}

export const ADMIN_ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "adminc.users.err.forbidden",
  MFA_REQUIRED: "adminc.users.err.mfa",
  REASON_TOO_SHORT: "adminc.users.err.reason",
  VERSION_CONFLICT: "adminc.users.err.conflict",
  SELF_TARGET: "adminc.users.err.self",
  LAST_ADMIN: "adminc.users.err.lastAdmin",
  NOT_SUPPORTED: "adminc.users.err.notSupported",
  CONFIRMATION_MISMATCH: "adminc.users.err.confirm",
  PROFILE_NOT_FOUND: "adminc.users.err.notFound",
  RATING_OUT_OF_RANGE: "adminc.users.err.rating",
};
