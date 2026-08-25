/**
 * Timed rating locks.
 *
 * A fair-play warning never bans an account: it suspends *rating* for a bounded
 * window. The window length scales with the strength of the evidence and with
 * how many times the player has already been locked, and it expires on its own
 * so no admin action is required to restore a false positive.
 */
import { translate } from "@/lib/i18n";
import { THRESHOLDS } from "./thresholds";

export interface LockInput {
  /** Peak suspicion score across the reviewed window (0-100). */
  score: number;
  /** SPRT verdict across recent games. */
  sprtDecision: string;
  boostingScore: number;
  sandbaggingScore: number;
  /** Number of previous automatic rating holds for this player. */
  priorLocks: number;
}

export const LOCK_MAX_HOURS = 720;

/** Hours a new automatic rating lock should last; 0 means "do not lock". */
export function lockHoursFor(input: LockInput): number {
  let base = 0;
  if (input.score >= 95) base = 168;
  else if (input.score >= THRESHOLDS.hold) base = 72;
  if (input.sprtDecision === "assisted") base = Math.max(base, 72);
  if (input.boostingScore >= 80 || input.sandbaggingScore >= 80) base = Math.max(base, 48);
  if (base === 0) return 0;
  const escalated = base * (1 + Math.min(3, Math.max(0, input.priorLocks)));
  return Math.min(LOCK_MAX_HOURS, Math.round(escalated));
}

export function isLockActive(row: {
  rating_locked: boolean | null;
  lock_expires_at: string | null;
}, now = Date.now()): boolean {
  if (!row.rating_locked) return false;
  if (!row.lock_expires_at) return true;
  return new Date(row.lock_expires_at).getTime() > now;
}

export function remainingLockMs(expiresAt: string | null, now = Date.now()): number {
  if (!expiresAt) return Infinity;
  return Math.max(0, new Date(expiresAt).getTime() - now);
}

export function formatRemaining(ms: number): string {
  if (!Number.isFinite(ms)) return translate("admin.lock.unlimited");
  if (ms <= 0) return translate("admin.lock.expired");
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return translate("admin.lock.daysHours", { days, hours: hours % 24 });
  }
  if (hours >= 1) return translate("admin.lock.hoursMinutes", { hours, minutes });
  return translate("admin.lock.minutes", { minutes });
}
