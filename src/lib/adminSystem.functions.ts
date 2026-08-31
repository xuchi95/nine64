/**
 * Admin system console — secret inventory, live rate-limit quota and the
 * effective security headers/CSP.
 *
 * Every handler is admin + MFA gated. Secret *values* are never read, returned
 * or logged: only the variable name, its group and whether it is configured.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFairplayAdmin } from "@/lib/fairplay/adminGuard";
import { PUBLIC_ENV_VARS, SERVER_ENV_VARS } from "@/lib/security/env";
import {
  buildSecurityHeaders,
  cacheControlFor,
  isPreviewHost,
  needsTurnstileEval,
} from "@/lib/security/headers";
import { RATE_LIMIT_POLICY, type RateLimitAction } from "@/lib/ratelimit/policy";

export interface SecretStatusRow {
  name: string;
  group: "public" | "server";
  configured: boolean;
  /** Blocks the server from booting / a costly endpoint when missing. */
  required: boolean;
}

export interface RateLimitStatusRow {
  action: string;
  scope: string;
  windowSeconds: number;
  limit: number;
  failClosed: boolean;
  /** Distinct subjects with an active bucket. */
  activeBuckets: number;
  /** Highest consumption currently in a live window. */
  peakCount: number;
  /** Subjects already at or over the limit. */
  blocked: number;
}

export interface SecurityHeaderRow {
  name: string;
  value: string;
}

const REQUIRED = new Set([
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RATE_LIMIT_SALT",
]);

const HEADER_PATHS = ["/", "/contact", "/game/preview", "/api/public/fairplay"] as const;

/** Secret inventory (names + configured flag only), live quota and headers. */
export const getSystemSecurityStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        headerPath: z.enum(HEADER_PATHS).default("/"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertFairplayAdmin(context);

    const env = process.env as Record<string, string | undefined>;
    const secrets: SecretStatusRow[] = [
      ...PUBLIC_ENV_VARS.map((name) => ({
        name,
        group: "public" as const,
        configured: Boolean((env[name] ?? "").trim()),
        required: false,
      })),
      ...SERVER_ENV_VARS.map((name) => ({
        name,
        group: "server" as const,
        configured: Boolean((env[name] ?? "").trim()),
        required: REQUIRED.has(name),
      })),
    ];

    // --- live limiter buckets -------------------------------------------
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowMs = Date.now();
    const { data: buckets } = await supabaseAdmin
      .from("rate_limit_counters")
      .select("bucket_key, window_start, window_seconds, count")
      .order("count", { ascending: false })
      .limit(2000);

    const live = (buckets ?? []).filter((b) => {
      const end = new Date(b.window_start).getTime() + b.window_seconds * 1000;
      return end > nowMs;
    });

    const limits: RateLimitStatusRow[] = (
      Object.keys(RATE_LIMIT_POLICY) as RateLimitAction[]
    ).map((action) => {
      const rule = RATE_LIMIT_POLICY[action];
      const rows = live.filter((b) => b.bucket_key.startsWith(`${action}|`));
      return {
        action,
        scope: rule.scope,
        windowSeconds: rule.windowSeconds,
        limit: rule.limit,
        failClosed: rule.failClosed,
        activeBuckets: rows.length,
        peakCount: rows.reduce((max, r) => Math.max(max, r.count), 0),
        blocked: rows.filter((r) => r.count >= rule.limit).length,
      };
    });

    // --- effective headers for the chosen path ---------------------------
    let origin = "https://nine64.com";
    try {
      origin = new URL(getRequest().url).origin;
    } catch {
      /* outside a request scope */
    }
    const url = new URL(data.headerPath, origin);
    const production = process.env["NODE_ENV"] === "production";
    const built = buildSecurityHeaders({
      url,
      production,
      supabaseUrl: process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "",
    });
    const cache = cacheControlFor(url.pathname, "text/html");
    const headers: SecurityHeaderRow[] = [
      ...Object.entries(built).map(([name, value]) => ({ name, value })),
      ...(cache ? [{ name: "cache-control", value: cache }] : []),
    ].sort((a, b) => a.name.localeCompare(b.name));

    return {
      secrets,
      limits,
      headers,
      meta: {
        path: url.pathname,
        production,
        previewHost: isPreviewHost(url.hostname),
        turnstileEval: needsTurnstileEval(url.pathname),
        cspEnforced: true,
        generatedAt: new Date().toISOString(),
      },
    };
  });

export type SystemSecurityStatus = Awaited<ReturnType<typeof getSystemSecurityStatus>>;

/** Clears every live counter for one action (or all actions). Audited. */
export const resetRateLimitAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        action: z
          .enum(Object.keys(RATE_LIMIT_POLICY) as [RateLimitAction, ...RateLimitAction[]])
          .optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertFairplayAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const query = supabaseAdmin.from("rate_limit_counters").delete();
    const { data: deleted, error } = data.action
      ? await query.like("bucket_key", `${data.action}|%`).select("bucket_key")
      : await query.neq("bucket_key", "").select("bucket_key");
    if (error) throw new Error(error.message);
    const count = deleted?.length ?? 0;

    const { recordAdminAction } = await import("@/lib/admin/auditLog.server");
    await recordAdminAction({
      actorId: context.userId,
      action: "ratelimit_reset",
      note: data.action ?? "all",
      detail: { action: data.action ?? "all", cleared: count },
    });

    return { cleared: count };
  });
