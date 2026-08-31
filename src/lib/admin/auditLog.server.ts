/**
 * Admin audit trail writer.
 *
 * Every admin-only Fair Play surface records what was looked at and every
 * enforcement decision, with the acting admin and a timestamp. Writes go
 * through the service-role client so the rows are immutable from the app:
 * admins can read the log but never insert, edit or delete entries.
 *
 * Server-only module — never import from a component or from the module scope
 * of a `*.functions.ts` file.
 */

export type AdminAuditAction =
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
  | "ratelimit_reset";

export interface AdminAuditEntry {
  actorId: string;
  action: AdminAuditAction;
  targetUserId?: string | null;
  targetGameId?: string | null;
  note?: string | null;
  detail?: Record<string, unknown>;
}

/** Best-effort: an audit write must never break the admin action itself. */
export async function recordAdminAction(entry: AdminAuditEntry): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: entry.actorId,
      action: entry.action,
      target_user_id: entry.targetUserId ?? null,
      target_game_id: entry.targetGameId ?? null,
      note: entry.note ?? null,
      detail: (entry.detail ?? {}) as never,
    });
  } catch {
    // swallow — audit logging is observational
  }
}
