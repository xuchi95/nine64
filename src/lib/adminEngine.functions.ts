/**
 * Admin engine console server functions.
 *
 * Thin wrappers: implementations live in `@/lib/engine/*.server` and are
 * imported inside handlers. Everything is admin + MFA gated via
 * `assertAdmin(context, "engine")`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin/guard";
import { engineConfigSchema, ENGINE_PROFILE_STATUS } from "@/lib/engine/profileTypes";
import { BENCHMARK_KINDS } from "@/lib/engine/benchmarkTypes";
import { TITAN_SLUG } from "@/lib/engine/profileTypes";

const reason = z.string().trim().min(10).max(500);
const slug = z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/);

export const getEngineOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context, "engine");
    const { listEngineProfiles, ensureTitanProfile } = await import("@/lib/engine/profiles.server");
    const { cloudEngineHealth, breakerState } = await import("@/lib/engine/cloudEngine.server");
    const { listBenchmarks, publishReadiness } = await import("@/lib/engine/benchmarks.server");
    const { listActiveSessions } = await import("@/lib/engine/botSessions.server");
    const { recordAdminAction } = await import("@/lib/admin/auditLog.server");
    const { engineEnvDiagnostics } = await import("@/lib/engine/engineEnv.server");

    await ensureTitanProfile();
    const [{ rows, degraded }, health, benchmarks, sessions] = await Promise.all([
      listEngineProfiles(true),
      cloudEngineHealth(),
      listBenchmarks(undefined, 20),
      listActiveSessions(50),
    ]);
    // Readiness is shown for the draft config the admin would actually publish.
    const titan = rows.find((r) => r.slug === TITAN_SLUG) ?? rows[0];
    const readiness = await publishReadiness(titan?.slug, titan?.draftConfig ?? null);
    await recordAdminAction({
      actorId: context.userId,
      action: "system_console_view",
      detail: { view: "engine" },
    });
    // Booleans + codes only — never a secret value.
    const env = engineEnvDiagnostics();
    return { profiles: rows, degraded, health, breaker: breakerState(), benchmarks, readiness, sessions, env };
  });

export type EngineOverview = Awaited<ReturnType<typeof getEngineOverview>>;

/**
 * "Kiểm tra kết nối": a *server-side* live probe of Cloud Run. The browser
 * never talks to the engine and never sees a URL, token or secret value.
 */
export const checkEngineConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    await assertAdmin(context, "engine");
    const { cloudEngineHealthCached } = await import("@/lib/engine/cloudEngine.server");
    const { engineEnvDiagnostics } = await import("@/lib/engine/engineEnv.server");
    const env = engineEnvDiagnostics();
    if (!env.configured) {
      return { ok: false as const, code: env.code, health: null };
    }
    // maxAge 0 forces a real round-trip instead of the 10s cache.
    const health = await cloudEngineHealthCached(0);
    const ok = health.status === "healthy" || health.status === "degraded";
    return {
      ok,
      code: ok
        ? "READY"
        : health.status === "unauthorized"
          ? "ENGINE_AUTH_FAILED"
          : "ENGINE_UNAVAILABLE",
      health,
    };
  });


export const saveEngineDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        slug,
        config: engineConfigSchema,
        expectedVersion: z.number().int().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const identity = await assertAdmin(context, "engine");
    const { saveProfileDraft } = await import("@/lib/engine/profiles.server");
    void identity;
    return saveProfileDraft(data.slug, data.config, data.expectedVersion);
  });

export const publishEngineProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        slug,
        config: engineConfigSchema,
        status: z.enum(ENGINE_PROFILE_STATUS as unknown as [string, ...string[]]),
        enabled: z.boolean(),
        reason,
        expectedVersion: z.number().int().nullable().default(null),
        rollbackOf: z.number().int().optional(),
        ignoreReadiness: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const identity = await assertAdmin(context, "engine");
    const { publishProfile } = await import("@/lib/engine/profiles.server");
    const { publishReadiness } = await import("@/lib/engine/benchmarks.server");
    const { recordAdminActionStrict } = await import("@/lib/admin/auditLog.server");

    // A live, enabled profile requires green benchmarks recorded for the engine.
    if (data.enabled && data.status === "published" && !data.ignoreReadiness) {
      const readiness = await publishReadiness(data.slug, data.config);
      if (!readiness.ready) {
        return { ok: false as const, code: "BENCHMARK_REQUIRED", reasons: readiness.reasons };
      }
    }

    const result = await publishProfile({
      slug: data.slug,
      config: data.config,
      status: data.status as never,
      enabled: data.enabled,
      reason: data.reason,
      actorId: identity.userId,
      expectedVersion: data.expectedVersion,
    });
    if (!result.ok) return { ok: false as const, code: result.code ?? "WRITE_FAILED" };

    await recordAdminActionStrict({
      actorId: identity.userId,
      action: data.rollbackOf !== undefined ? "engine_profile_rollback" : "engine_profile_publish",
      note: data.reason,
      detail: { slug: data.slug, version: result.version, rollbackOf: data.rollbackOf ?? null },
      before: { config: result.before?.config ?? null, version: result.before?.version ?? 0 },
      after: { config: data.config, version: result.version },
    });
    return { ok: true as const, version: result.version };
  });

export const getEngineVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ slug }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context, "engine");
    const { listProfileVersions } = await import("@/lib/engine/profiles.server");
    return listProfileVersions(data.slug, 50);
  });

export const runEngineBenchmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        kind: z.enum(BENCHMARK_KINDS as unknown as [string, ...string[]]),
        reason,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const identity = await assertAdmin(context, "engine");
    const { enforceRateLimit, userSubject } = await import("@/lib/ratelimit/limiter.server");
    const { runBenchmark } = await import("@/lib/engine/benchmarks.server");
    const { recordAdminActionStrict } = await import("@/lib/admin/auditLog.server");

    await enforceRateLimit("engine.benchmark", userSubject(identity.userId));
    const result = await runBenchmark({ kind: data.kind as never, actorId: identity.userId });
    await recordAdminActionStrict({
      actorId: identity.userId,
      action: "engine_benchmark_run",
      note: data.reason,
      detail: { kind: data.kind, ok: result.ok, code: result.code ?? null, benchmarkId: result.row?.id ?? null },
    });
    return result.ok
      ? { ok: true as const, row: result.row! }
      : { ok: false as const, code: result.code ?? "FAILED" };
  });

export const disableEngineProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ slug, reason }).parse(input))
  .handler(async ({ data, context }) => {
    const identity = await assertAdmin(context, "engine");
    const { emergencyDisable } = await import("@/lib/engine/profiles.server");
    const { recordAdminActionStrict } = await import("@/lib/admin/auditLog.server");
    const result = await emergencyDisable(data.slug, identity.userId, data.reason);
    await recordAdminActionStrict({
      actorId: identity.userId,
      action: "engine_profile_publish",
      note: data.reason,
      detail: { slug: data.slug, emergencyDisable: true, ok: result.ok, code: result.code ?? null },
    });
    return result;
  });

export const expireBotSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ idleMinutes: z.number().int().min(5).max(1440).default(240) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context, "engine");
    const { expireIdleSessions } = await import("@/lib/engine/botSessions.server");
    return { expired: await expireIdleSessions(data.idleMinutes) };
  });
