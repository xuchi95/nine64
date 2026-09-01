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

export const getTitanStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { titanProfile } = await import("@/lib/engine/profiles.server");
  const { cloudEngineConfigured, cloudEngineHealth } = await import(
    "@/lib/engine/cloudEngine.server"
  );
  try {
    const profile = await titanProfile();
    const configured = cloudEngineConfigured();
    let state: "ready" | "not_configured" | "disabled" | "unavailable";
    if (!configured) state = "not_configured";
    else if (!profile.enabled) state = "disabled";
    else {
      const health = await cloudEngineHealth();
      state =
        health.status === "healthy" || health.status === "degraded"
          ? "ready"
          : health.status === "not_configured"
            ? "not_configured"
            : "unavailable";
    }
    return {
      state,
      available: state === "ready",
      configured,
      enabled: profile.enabled,
      name: profile.name,
      stockfishVersion: profile.stockfishVersion,
      source: profile.source,
    };
  } catch {
    // Never surface stack traces, URLs or credentials to the client.
    return {
      state: "unavailable" as const,
      available: false,
      configured: false,
      enabled: false,
      name: "Nine64 Titan",
      stockfishVersion: null,
      source: "fallback" as const,
    };
  }
});


export const startTitanSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        playerColor: z.enum(["w", "b"]),
        variant: z.enum(["standard", "chess960"]).default("standard"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { titanProfile } = await import("@/lib/engine/profiles.server");
    const { cloudEngineConfigured } = await import("@/lib/engine/cloudEngine.server");
    const { createSession } = await import("@/lib/engine/botSessions.server");
    const { enforceRateLimit, userSubject } = await import("@/lib/ratelimit/limiter.server");
    const { TITAN_LEVEL } = await import("@/lib/engine/profileTypes");

    // Server-authoritative: every condition is re-checked here, whatever the
    // client-side preflight status said.
    try {
      await enforceRateLimit("titan.session", userSubject(context.userId));
    } catch {
      return { ok: false as const, code: "QUOTA_EXCEEDED" };
    }
    const profile = await titanProfile();
    if (!profile.enabled) return { ok: false as const, code: "PROFILE_DISABLED" };
    if (!cloudEngineConfigured()) return { ok: false as const, code: "ENGINE_NOT_CONFIGURED" };



    const res = await createSession({
      userId: context.userId,
      playerColor: data.playerColor,
      variant: data.variant,
      config: profile.config,
      level: TITAN_LEVEL,
    });
    if (!res.ok) return { ok: false as const, code: res.code };

    // Player chose Black: the engine opens. Idempotent on the server.
    if (data.playerColor === "b") {
      const { engineOpeningMove } = await import("@/lib/engine/botSessions.server");
      const opened = await engineOpeningMove({
        sessionId: res.snapshot.sessionId,
        userId: context.userId,
        config: profile.config,
        clock: null,
      });
      if (!opened.ok) return { ok: false as const, code: opened.code };
      return { ok: true as const, snapshot: opened.snapshot };
    }
    return { ok: true as const, snapshot: res.snapshot };
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
    z.object({ sessionId: z.string().uuid(), reason: z.enum(["resign", "abort"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { endSession } = await import("@/lib/engine/botSessions.server");
    const res = await endSession(data.sessionId, context.userId, data.reason);
    return res.ok ? { ok: true as const, snapshot: res.snapshot } : { ok: false as const, code: res.code };
  });
