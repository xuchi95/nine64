import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFairplayAdmin } from "@/lib/fairplay/adminGuard";

export interface SecurityEventRow {
  id: string;
  createdAt: string;
  userId: string | null;
  displayName: string;
  kind: string;
  resource: string | null;
  operation: string | null;
  errorCode: string | null;
  message: string | null;
  path: string | null;
  userAgent: string | null;
}

export interface ProbeAlertRow {
  userId: string | null;
  displayName: string;
  events: number;
  resources: number;
  kinds: string[];
  firstSeen: string;
  lastSeen: string;
}

/** Recent denied-access events, newest first. Admin + MFA only. */
export const listSecurityEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        kind: z.enum(["all", "access_denied", "probe_suspected", "rpc_denied"]).default("all"),
        windowMinutes: z.number().int().min(15).max(10080).default(1440),
        limit: z.number().int().min(20).max(500).default(200),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertFairplayAdmin(context);

    const since = new Date(Date.now() - data.windowMinutes * 60_000).toISOString();
    let query = context.supabase
      .from("security_events")
      .select("id, created_at, user_id, kind, resource, operation, error_code, message, path, user_agent")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.kind !== "all") query = query.eq("kind", data.kind);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const ids = [...new Set((rows ?? []).map((r) => r.user_id).filter((v): v is string => Boolean(v)))];
    const { data: profiles } = ids.length
      ? await context.supabase.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] };
    const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

    return (rows ?? []).map<SecurityEventRow>((r) => ({
      id: r.id,
      createdAt: r.created_at,
      userId: r.user_id,
      displayName: r.user_id ? (names.get(r.user_id) ?? r.user_id.slice(0, 8)) : "Khách (chưa đăng nhập)",
      kind: r.kind,
      resource: r.resource,
      operation: r.operation,
      errorCode: r.error_code,
      message: r.message,
      path: r.path,
      userAgent: r.user_agent,
    }));
  });

/** Accounts whose denial count crosses the alert threshold in the window. */
export const listProbeAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        windowMinutes: z.number().int().min(15).max(10080).default(1440),
        threshold: z.number().int().min(2).max(100).default(5),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertFairplayAdmin(context);

    const { data: rows, error } = await context.supabase.rpc("security_probe_alerts", {
      _window_minutes: data.windowMinutes,
      _threshold: data.threshold,
    });
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as {
      user_id: string | null;
      events: number;
      resources: number;
      kinds: string[] | null;
      first_seen: string;
      last_seen: string;
    }[];

    const ids = [...new Set(list.map((r) => r.user_id).filter((v): v is string => Boolean(v)))];
    const { data: profiles } = ids.length
      ? await context.supabase.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] };
    const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

    return list.map<ProbeAlertRow>((r) => ({
      userId: r.user_id,
      displayName: r.user_id ? (names.get(r.user_id) ?? r.user_id.slice(0, 8)) : "Khách (chưa đăng nhập)",
      events: r.events,
      resources: r.resources,
      kinds: r.kinds ?? [],
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
    }));
  });
