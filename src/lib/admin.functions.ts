import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFairplayAdmin } from "@/lib/fairplay/adminGuard";

export interface AdminAuditRow {
  id: string;
  createdAt: string;
  action: string;
  actorId: string;
  actorName: string;
  targetUserId: string | null;
  targetName: string | null;
  targetGameId: string | null;
  note: string | null;
  detail: Record<string, string | number | boolean | null>;
}

/** Full admin activity trail: views and enforcement decisions, newest first. */
export const listAdminAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        /** "all" | "view" (read-only access) | "change" (enforcement) */
        kind: z.enum(["all", "view", "change"]).default("all"),
        actorId: z.string().uuid().optional(),
        targetUserId: z.string().uuid().optional(),
        limit: z.number().int().min(20).max(500).default(200),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertFairplayAdmin(context);

    const VIEW_ACTIONS = ["case_list_view", "case_view", "metrics_view", "decision_log_view", "audit_log_view"];
    const CHANGE_ACTIONS = ["rating_hold", "clear_warning", "unlock"];

    let query = context.supabase
      .from("admin_audit_log")
      .select("id, created_at, action, actor_id, target_user_id, target_game_id, note, detail")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.kind === "view") query = query.in("action", VIEW_ACTIONS);
    if (data.kind === "change") query = query.in("action", CHANGE_ACTIONS);
    if (data.actorId) query = query.eq("actor_id", data.actorId);
    if (data.targetUserId) query = query.eq("target_user_id", data.targetUserId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const ids = [
      ...new Set(
        (rows ?? []).flatMap((r) => [r.actor_id, r.target_user_id]).filter((v): v is string => Boolean(v)),
      ),
    ];
    const { data: profiles } = ids.length
      ? await context.supabase.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

    const { recordAdminAction } = await import("@/lib/admin/auditLog.server");
    await recordAdminAction({
      actorId: context.userId,
      action: "audit_log_view",
      detail: { kind: data.kind, results: rows?.length ?? 0 },
    });

    return (rows ?? []).map<AdminAuditRow>((r) => ({
      id: r.id,
      createdAt: r.created_at,
      action: r.action,
      actorId: r.actor_id,
      actorName: byId.get(r.actor_id) ?? "Quản trị viên",
      targetUserId: r.target_user_id,
      targetName: r.target_user_id ? (byId.get(r.target_user_id) ?? "Người chơi") : null,
      targetGameId: r.target_game_id,
      note: r.note,
      detail: (r.detail ?? {}) as Record<string, string | number | boolean | null>,
    }));
  });
