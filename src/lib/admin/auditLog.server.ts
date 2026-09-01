/**
 * Admin audit trail writer.
 *
 * Every admin surface records what was looked at and every mutation, with the
 * acting admin, a mandatory reason for changes, redacted before/after state
 * and a correlation id. Writes go through the service-role client so the rows
 * are immutable from the app: admins can read the log but never insert, edit
 * or delete entries.
 *
 * Server-only module — never import from a component or from the module scope
 * of a `*.functions.ts` file.
 */

export type AdminAuditAction =
  // Fair Play (existing)
  | "case_list_view"
  | "case_view"
  | "metrics_view"
  | "decision_log_view"
  | "audit_log_view"
  | "rating_hold"
  | "clear_warning"
  | "unlock"
  | "fairplay_job_retry"
  | "system_console_view"
  | "ratelimit_reset"
  // Admin Center
  | "dashboard_view"
  | "user_list_view"
  | "user_view"
  | "user_suspend"
  | "user_unsuspend"
  | "user_role_change"
  | "user_force_logout"
  | "user_anonymize_request"
  | "rating_adjustment"
  | "system_setting_publish"
  | "system_setting_rollback"
  | "maintenance_change"
  | "feature_flag_change"
  | "engine_profile_publish"
  | "engine_profile_rollback"
  | "engine_benchmark_run"
  | "engine_qualification_run"
  | "ai_prompt_publish"
  | "ai_prompt_rollback";

/** Actions that change state — these must never be logged best-effort. */
export const MUTATING_ADMIN_ACTIONS: readonly AdminAuditAction[] = [
  "rating_hold",
  "clear_warning",
  "unlock",
  "fairplay_job_retry",
  "ratelimit_reset",
  "user_suspend",
  "user_unsuspend",
  "user_role_change",
  "user_force_logout",
  "user_anonymize_request",
  "rating_adjustment",
  "system_setting_publish",
  "system_setting_rollback",
  "maintenance_change",
  "feature_flag_change",
  "engine_profile_publish",
  "engine_profile_rollback",
  "engine_benchmark_run",
  "engine_qualification_run",
  "ai_prompt_publish",
  "ai_prompt_rollback",
];

export interface AdminAuditEntry {
  actorId: string;
  action: AdminAuditAction;
  targetUserId?: string | null;
  targetGameId?: string | null;
  /** Mandatory reason for mutating actions. */
  note?: string | null;
  detail?: Record<string, unknown>;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  requestId?: string | null;
}

const SENSITIVE_KEY = /pass(word)?|token|secret|otp|totp|mfa_code|api[_-]?key|authorization|cookie|session/i;

/** Drop credential-shaped fields before anything reaches the audit table. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = redact(v, depth + 1);
  }
  return out;
}

export function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function buildRow(entry: AdminAuditEntry) {
  const detail = {
    ...(redact(entry.detail ?? {}) as Record<string, unknown>),
    request_id: entry.requestId ?? newRequestId(),
    ...(entry.before !== undefined ? { before: redact(entry.before) } : {}),
    ...(entry.after !== undefined ? { after: redact(entry.after) } : {}),
  };
  return {
    actor_id: entry.actorId,
    action: entry.action,
    target_user_id: entry.targetUserId ?? null,
    target_game_id: entry.targetGameId ?? null,
    note: entry.note ?? null,
    detail: detail as never,
  };
}

/** Best-effort: used for read-only view events, never for mutations. */
export async function recordAdminAction(entry: AdminAuditEntry): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_audit_log").insert(buildRow(entry));
  } catch {
    // swallow — observational only
  }
}

/**
 * Strict write for mutations: if the audit row cannot be written the caller
 * must abort, so a state change can never happen without a trail.
 */
export async function recordAdminActionStrict(entry: AdminAuditEntry): Promise<void> {
  if (!entry.note || !entry.note.trim()) {
    throw new Error("AUDIT_REASON_REQUIRED");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("admin_audit_log").insert(buildRow(entry));
  if (error) throw new Error(`AUDIT_WRITE_FAILED: ${error.message}`);
}
