import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, resolveAdminRole } from "@/lib/admin/guard";
import type { AdminModule, AdminRole } from "@/lib/admin/permissions";
import { modulesForRole } from "@/lib/admin/permissions";

export interface AdminAccess {
  role: AdminRole | null;
  modules: AdminModule[];
}

/** Role + allowed modules for the current caller (UX gating only). */
export const getAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAccess> => {
    const role = await resolveAdminRole(context);
    return { role, modules: [...modulesForRole(role)] as AdminModule[] };
  });

export type WidgetState<T> = { ok: true; value: T } | { ok: false; error: string };

export interface AdminDashboard {
  generatedAt: string;
  windowDays: 1 | 7 | 30;
  users: WidgetState<{ total: number; new24h: number; new7d: number; new30d: number }>;
  games: WidgetState<{ total: number; last24h: number; active: number; timeoutPending: number }>;
  queue: WidgetState<{ waiting: number }>;
  fairplay: WidgetState<{ queued: number; running: number; failed: number; workerConfigured: boolean }>;
  notifications: WidgetState<{ queued: number; failed: number }>;
  security: WidgetState<{ events24h: number }>;
  ai: WidgetState<{ failures: number; rateLimited: number }>;
  engine: WidgetState<{ status: "configured" | "not_configured" }>;
}

async function widget<T>(fn: () => Promise<T>): Promise<WidgetState<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "UNKNOWN_ERROR" };
  }
}

function iso(hoursAgo: number) {
  return new Date(Date.now() - hoursAgo * 3600_000).toISOString();
}

/** Live operational metrics. Every widget fails independently. */
export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ windowDays: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(1) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<AdminDashboard> => {
    const identity = await assertAdmin(context, "dashboard");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const count = async (
      table: string,
      apply?: (q: ReturnType<typeof supabaseAdmin.from> extends never ? never : any) => any,
    ): Promise<number> => {
      let q = supabaseAdmin.from(table as never).select("*", { count: "exact", head: true }) as any;
      if (apply) q = apply(q);
      const { count: n, error } = await q;
      if (error) throw new Error(error.message);
      return n ?? 0;
    };

    const [users, games, queue, fairplay, notifications, security, ai] = await Promise.all([
      widget(async () => ({
        total: await count("profiles"),
        new24h: await count("profiles", (q) => q.gte("created_at", iso(24))),
        new7d: await count("profiles", (q) => q.gte("created_at", iso(24 * 7))),
        new30d: await count("profiles", (q) => q.gte("created_at", iso(24 * 30))),
      })),
      widget(async () => ({
        total: await count("games"),
        last24h: await count("games", (q) => q.gte("created_at", iso(24))),
        active: await count("games", (q) => q.eq("status", "active")),
        timeoutPending: await count("games", (q) =>
          q.eq("status", "active").lt("last_move_at", iso(1)),
        ),
      })),
      widget(async () => ({ waiting: await count("matchmaking_queue", (q) => q.eq("status", "waiting")) })),
      widget(async () => ({
        queued: await count("fairplay_jobs", (q) => q.eq("status", "queued")),
        running: await count("fairplay_jobs", (q) => q.eq("status", "running")),
        failed: await count("fairplay_jobs", (q) => q.eq("status", "failed")),
        workerConfigured: Boolean(process.env["FAIRPLAY_WORKER_URL"]),
      })),
      widget(async () => ({
        queued: await count("notification_outbox", (q) => q.eq("status", "queued")),
        failed: await count("notification_outbox", (q) => q.eq("status", "failed")),
      })),
      widget(async () => ({ events24h: await count("security_events", (q) => q.gte("created_at", iso(24))) })),
      widget(async () => ({
        failures: await count("security_events", (q) =>
          q.eq("kind", "ai_error").gte("created_at", iso(24)),
        ),
        rateLimited: await count("security_events", (q) =>
          q.eq("kind", "rate_limited").gte("created_at", iso(24)),
        ),
      })),
    ]);

    const { recordAdminAction } = await import("@/lib/admin/auditLog.server");
    await recordAdminAction({
      actorId: identity.userId,
      action: "dashboard_view",
      detail: { windowDays: data.windowDays, role: identity.role },
    });

    return {
      generatedAt: new Date().toISOString(),
      windowDays: data.windowDays,
      users,
      games,
      queue,
      fairplay,
      notifications,
      security,
      ai,
      engine: {
        ok: true,
        value: { status: process.env["CLOUD_ENGINE_URL"] ? "configured" : "not_configured" },
      },
    };
  });
