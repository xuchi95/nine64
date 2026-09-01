/**
 * Player-facing Nine64 Titan server functions.
 *
 * Thin wrappers: everything runs inside the handler, so no server-only module
 * reaches the client bundle. Authenticated + rate limited + idempotent.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uci = z
  .string()
  .trim()
  .regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "invalid uci");

export type TitanState = "ready" | "not_configured" | "disabled" | "unavailable";

export interface TitanStatus {
  state: TitanState;
  available: boolean;
  configured: boolean;
  enabled: boolean;
  health: "healthy" | "degraded" | "unavailable" | "not_configured";
  name: string;
  stockfishVersion: string | null;
  source: "database" | "fallback";
  /** Stable diagnostic code — never a stack trace, URL or secret. */
  code: string;
}

/**
 * Public-safe readiness of Nine64 Titan. Every field is a boolean, an enum or
 * a stable code: no credential, URL or internal error ever leaves here.
 */
export const getTitanStatus = createServerFn({ method: "GET" }).handler(async (): Promise<TitanStatus> => {
  const base = {
    name: "Nine64 Titan",
    stockfishVersion: null as string | null,
    source: "fallback" as const,
  };
  try {
    const { titanProfile } = await import("@/lib/engine/profiles.server");
    const { cloudEngineHealthCached } = await import("@/lib/engine/cloudEngine.server");
    const { engineEnvDiagnostics } = await import("@/lib/engine/engineEnv.server");

    const env = engineEnvDiagnostics();
    const profile = await titanProfile();
    const info = {
      name: profile.name,
      stockfishVersion: profile.stockfishVersion,
      source: profile.source,
    };
    const configured = env.present.PLAY_ENGINE_URL && env.present.PLAY_ENGINE_SA_EMAIL && env.present.PLAY_ENGINE_SA_PRIVATE_KEY;

    if (!configured) {
      return {
        ...info,
        state: "not_configured",
        available: false,
        configured: false,
        enabled: profile.enabled,
        health: "not_configured",
        code: env.code === "INVALID_ENGINE_CREDENTIALS" ? "INVALID_ENGINE_CREDENTIALS" : "ENGINE_NOT_CONFIGURED",
      };
    }
    if (!profile.enabled) {
      return {
        ...info,
        state: "disabled",
        available: false,
        configured: true,
        enabled: false,
        health: "not_configured",
        code: profile.source === "fallback" ? "PROFILE_MISSING" : "PROFILE_DISABLED",
      };
    }

    const health = await cloudEngineHealthCached();
    const ready = health.status === "healthy" || health.status === "degraded";
    return {
      ...info,
      state: ready ? "ready" : health.status === "not_configured" ? "not_configured" : "unavailable",
      available: ready,
      configured: true,
      enabled: true,
      health: health.status,
      code: ready ? "OK" : "ENGINE_UNAVAILABLE",
    };
  } catch {
    // Never surface stack traces, URLs or credentials to the client.
    return {
      ...base,
      state: "unavailable",
      available: false,
      configured: false,
      enabled: false,
      health: "unavailable",
      code: "ENGINE_UNAVAILABLE",
    };
  }
});


export const startTitanSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        playerColor: z.enum(["w", "b"]),
        // Accept the raw variant id so an unsupported variant is rejected
        // explicitly instead of being silently coerced to standard.
        variant: z.string().default("standard"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { isTitanVariant, titanVariantBlockCode } = await import("@/lib/engine/titanVariants");
    if (!isTitanVariant(data.variant)) {
      return {
        ok: false as const,
        code: "VARIANT_NOT_SUPPORTED",
        reason: titanVariantBlockCode(data.variant),
      };
    }
    const variant = data.variant;
    const { titanProfile } = await import("@/lib/engine/profiles.server");
    const { cloudEngineHealthCached } = await import("@/lib/engine/cloudEngine.server");
    const { engineEnvDiagnostics } = await import("@/lib/engine/engineEnv.server");
    const { createSession } = await import("@/lib/engine/botSessions.server");
    type Snap = Extract<Awaited<ReturnType<typeof createSession>>, { ok: true }>["snapshot"];
    const { enforceRateLimit, userSubject } = await import("@/lib/ratelimit/limiter.server");
    const { TITAN_LEVEL } = await import("@/lib/engine/profileTypes");

    // Server-authoritative: every condition is re-checked here, whatever the
    // client-side preflight status said.
    try {

      await enforceRateLimit("titan.session", userSubject(context.userId));
    } catch {
      return { ok: false as const, code: "QUOTA_EXCEEDED" };
    }
    // Preflight, in order, before ANY database write. No session row is
    // created unless the engine is genuinely reachable, and there is never a
    // silent fallback to a weaker engine.
    const profile = await titanProfile();
    if (!profile.enabled) {
      return { ok: false as const, code: profile.source === "fallback" ? "PROFILE_MISSING" : "PROFILE_DISABLED" };
    }
    const env = engineEnvDiagnostics();
    if (env.code === "INVALID_ENGINE_CREDENTIALS") {
      return { ok: false as const, code: "INVALID_ENGINE_CREDENTIALS" };
    }
    if (!env.present.PLAY_ENGINE_URL || !env.present.PLAY_ENGINE_SA_EMAIL || !env.present.PLAY_ENGINE_SA_PRIVATE_KEY) {
      return { ok: false as const, code: "ENGINE_NOT_CONFIGURED" };
    }
    const health = await cloudEngineHealthCached();
    if (health.status !== "healthy" && health.status !== "degraded") {
      return {
        ok: false as const,
        code: health.status === "not_configured" ? "ENGINE_NOT_CONFIGURED" : "ENGINE_UNAVAILABLE",
      };
    }

    const { startWithRollback } = await import("@/lib/engine/sessionLifecycle");
    const { endSession, engineOpeningMove } = await import("@/lib/engine/botSessions.server");

    // A start that fails after the row exists MUST roll the row back,
    // otherwise repeated failures burn the maxConcurrentGames budget.
    const started = await startWithRollback<Snap>({
      create: async () => {
        const res = await createSession({
          userId: context.userId,
          playerColor: data.playerColor,
          variant: data.variant,
          config: profile.config,
          level: TITAN_LEVEL,
        });
        return res.ok ? { ok: true, snapshot: res.snapshot } : { ok: false, code: res.code };
      },
      opening:
        data.playerColor === "b"
          ? async (snapshot) => {
              const opened = await engineOpeningMove({
                sessionId: snapshot.sessionId,
                userId: context.userId,
                config: profile.config,
                clock: null,
              });
              return opened.ok ? { ok: true, snapshot: opened.snapshot } : { ok: false, code: opened.code };
            }
          : null,
      abort: async (sessionId) => {
        await endSession(sessionId, context.userId, "startup_failed");
      },
    });
    return started.ok
      ? { ok: true as const, snapshot: started.snapshot }
      : { ok: false as const, code: started.code };
  });


export const submitTitanMove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        sessionId: z.string().uuid(),
        expectedVersion: z.number().int().min(0),
        uci,
        idempotencyKey: z.string().min(8).max(80),
        clock: z
          .object({
            whiteMs: z.number().int().min(0).max(24 * 3600_000),
            blackMs: z.number().int().min(0).max(24 * 3600_000),
            whiteIncMs: z.number().int().min(0).max(600_000),
            blackIncMs: z.number().int().min(0).max(600_000),
          })
          .nullable()
          .default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { titanProfile } = await import("@/lib/engine/profiles.server");
    const { playMove } = await import("@/lib/engine/botSessions.server");
    const { enforceRateLimit, userSubject } = await import("@/lib/ratelimit/limiter.server");

    await enforceRateLimit("titan.move", userSubject(context.userId));
    const profile = await titanProfile();
    if (!profile.enabled) return { ok: false as const, code: "PROFILE_DISABLED" };

    const res = await playMove({
      sessionId: data.sessionId,
      userId: context.userId,
      expectedVersion: data.expectedVersion,
      uci: data.uci,
      idempotencyKey: data.idempotencyKey,
      config: profile.config,
      clock: data.clock,
    });
    return res.ok
      ? { ok: true as const, snapshot: res.snapshot, replayed: Boolean(res.replayed) }
      : { ok: false as const, code: res.code, snapshot: res.snapshot ?? null };
  });

export const getTitanSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getSession } = await import("@/lib/engine/botSessions.server");
    const res = await getSession(data.sessionId, context.userId);
    return res.ok ? { ok: true as const, snapshot: res.snapshot } : { ok: false as const, code: res.code };
  });

export const endTitanSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ sessionId: z.string().uuid(), reason: z.enum(["resign", "abort", "draw", "timeout"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { endSession } = await import("@/lib/engine/botSessions.server");
    const res = await endSession(data.sessionId, context.userId, data.reason);
    return res.ok ? { ok: true as const, snapshot: res.snapshot } : { ok: false as const, code: res.code };
  });
