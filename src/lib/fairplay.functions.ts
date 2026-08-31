import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFairplayAdmin } from "@/lib/fairplay/adminGuard";

const turnSchema = z.object({
  ply: z.number().int().min(0),
  spentMs: z.number().min(0).max(3_600_000),
  blurMs: z.number().min(0).max(3_600_000),
  blurCount: z.number().int().min(0).max(500),
  firstInteractionMs: z.number().min(0).max(3_600_000),
  directToTarget: z.boolean(),
  exploredSquares: z.number().int().min(0).max(64),
  pasted: z.boolean(),
  duplicateTab: z.boolean(),
});

/**
 * Behavioural telemetry from the player's own client. This is a weak signal,
 * never evidence on its own: it is stored with the service identity after the
 * server confirms the caller really played in that game, and the browser has
 * no direct write path to the fair-play tables.
 */
export const submitFairplaySignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        gameId: z.string().uuid(),
        turns: z.array(turnSchema).max(400),
        clientMeta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: game, error: gameError } = await context.supabase
      .from("games")
      .select("id, white_id, black_id")
      .eq("id", data.gameId)
      .maybeSingle();
    if (gameError) throw new Error(gameError.message);
    if (!game) throw new Error("Game not found");
    if (game.white_id !== context.userId && game.black_id !== context.userId) {
      throw new Error("Forbidden");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("fairplay_signals").upsert(
      {
        game_id: data.gameId,
        user_id: context.userId,
        turns: data.turns,
        client_meta: data.clientMeta,
      },
      { onConflict: "game_id,user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * A player complaint — a signal for human review, never a verdict. The subject
 * is derived server-side from the game, so a reporter cannot target a bystander,
 * and no confidence/sanction field is accepted from the client.
 */
export const submitPlayerReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        gameId: z.string().uuid(),
        reason: z.enum(["engine_assistance", "sandbagging", "stalling", "abuse", "other"]),
        note: z.string().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("submit_player_report", {
      _game_id: data.gameId,
      _reason: data.reason,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; code: string };
  });

/** The reporter's own complaints (read-only). */
export const listMyPlayerReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("player_reports")
      .select("id, game_id, reason, status, created_at")
      .eq("reporter_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Analysis queue health + worker configuration state for the admin console. */
export const listFairplayJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        status: z.enum(["all", "queued", "running", "succeeded", "failed"]).default("all"),
        limit: z.number().int().min(10).max(200).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertFairplayAdmin(context);

    let query = context.supabase
      .from("fairplay_jobs")
      .select(
        "id, game_id, analyzer_version, status, attempts, max_attempts, last_error, engine_version, depth, time_budget_ms, claimed_by, queued_at, started_at, finished_at",
      )
      .order("queued_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") query = query.eq("status", data.status);

    const { data: jobs, error } = await query;
    if (error) throw new Error(error.message);

    const { workerAuthConfigured } = await import("@/lib/fairplay/oidc.server");
    return {
      workerStatus: workerAuthConfigured() ? ("configured" as const) : ("not_configured" as const),
      jobs: jobs ?? [],
    };
  });

export const retryFairplayJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertFairplayAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("fairplay_retry_job", {
      _job_id: data.jobId,
    });
    if (error) throw new Error(error.message);

    const { recordAdminAction } = await import("@/lib/admin/auditLog.server");
    await recordAdminAction({
      actorId: context.userId,
      action: "fairplay_job_retry",
      detail: { jobId: data.jobId },
    });
    return result as { ok: boolean; code: string };
  });

/** Player complaints, kept strictly separate from machine evidence. */
export const listPlayerReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ subjectId: z.string().uuid().optional(), limit: z.number().int().min(10).max(200).default(50) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertFairplayAdmin(context);
    let query = context.supabase
      .from("player_reports")
      .select("id, reporter_id, subject_id, game_id, reason, note, status, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.subjectId) query = query.eq("subject_id", data.subjectId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getMyFairplayStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fairplay_status")
      .select("score, action, rating_locked, lock_started_at, lock_expires_at, lock_hours, games_reviewed, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const listFairplayCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFairplayAdmin(context);

    const { data, error } = await context.supabase
      .from("fairplay_status")
      .select(
        "user_id, score, action, sprt_llr, sprt_decision, boosting_score, sandbagging_score, rating_locked, lock_started_at, lock_expires_at, lock_hours, games_reviewed, reasons, updated_at",
      )
      .order("score", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const ids = (data ?? []).map((r) => r.user_id);
    const { data: profiles } = ids.length
      ? await context.supabase.from("profiles").select("id, display_name, rating").in("id", ids)
      : { data: [] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

    const { recordAdminAction } = await import("@/lib/admin/auditLog.server");
    await recordAdminAction({
      actorId: context.userId,
      action: "case_list_view",
      detail: { cases: ids.length },
    });

    return (data ?? []).map((row) => ({
      ...row,
      displayName: byId.get(row.user_id)?.display_name ?? "Người chơi",
      rating: byId.get(row.user_id)?.rating ?? null,
    }));
  });


export const getFairplayCase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertFairplayAdmin(context);

    const [status, reports, actions] = await Promise.all([
      context.supabase
        .from("fairplay_status")
        .select("*")
        .eq("user_id", data.userId)
        .maybeSingle(),
      context.supabase
        .from("fairplay_reports")
        .select("game_id, score, probability, confidence, action, reasons, contributions, features, created_at")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(20),
      context.supabase
        .from("fairplay_actions")
        .select("id, action, score, automatic, note, created_at, game_id")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const { recordAdminAction } = await import("@/lib/admin/auditLog.server");
    await recordAdminAction({
      actorId: context.userId,
      action: "case_view",
      targetUserId: data.userId,
      detail: { score: status.data?.score ?? null, action: status.data?.action ?? null },
    });

    return {
      status: status.data ?? null,
      reports: reports.data ?? [],
      actions: actions.data ?? [],
    };
  });


export const resolveFairplayCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        decision: z.enum(["clear", "rating_hold", "unlock"]),
        /** Lock duration in hours for a manual rating hold. */
        hours: z.number().int().min(1).max(720).default(72),
        note: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFairplayAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    const hold = data.decision === "rating_hold";
    const expiresAt = hold ? new Date(now.getTime() + data.hours * 3_600_000).toISOString() : null;

    await supabaseAdmin
      .from("fairplay_status")
      .upsert(
        {
          user_id: data.userId,
          rating_locked: hold,
          action: hold ? "rating_hold" : "none",
          score: hold ? 100 : 0,
          lock_started_at: hold ? now.toISOString() : null,
          lock_expires_at: expiresAt,
          lock_hours: hold ? data.hours : 0,
          unlocked_at: hold ? null : now.toISOString(),
          unlocked_by: hold ? null : context.userId,
          updated_at: now.toISOString(),
        },
        { onConflict: "user_id" },
      );

    await supabaseAdmin.from("fairplay_actions").insert({
      user_id: data.userId,
      action: hold ? "rating_hold" : data.decision === "unlock" ? "unlocked" : "cleared",
      score: hold ? 100 : 0,
      automatic: false,
      decided_by: context.userId,
      note: data.note ?? null,
    });

    const { recordAdminAction } = await import("@/lib/admin/auditLog.server");
    await recordAdminAction({
      actorId: context.userId,
      action: hold ? "rating_hold" : data.decision === "unlock" ? "unlock" : "clear_warning",
      targetUserId: data.userId,
      note: data.note ?? null,
      detail: hold ? { hours: data.hours, expiresAt } : {},
    });

    return { ok: true, lockExpiresAt: expiresAt, lockHours: hold ? data.hours : 0 };
  });


/** Detection / false-alarm / latency metrics for the admin dashboard. */
export const getFairplayMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFairplayAdmin(context);

    const { computeFairplayMetrics } = await import("@/lib/fairplay/metrics");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [reports, actions] = await Promise.all([
      supabaseAdmin
        .from("fairplay_reports")
        .select("score, probability, rating, eval_ms, created_at")
        .order("created_at", { ascending: false })
        .limit(2000),
      supabaseAdmin
        .from("fairplay_actions")
        .select("user_id, action, automatic, created_at")
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

    const { recordAdminAction } = await import("@/lib/admin/auditLog.server");
    await recordAdminAction({ actorId: context.userId, action: "metrics_view" });

    return computeFairplayMetrics(

      (reports.data ?? []).map((r) => ({
        score: Number(r.score),
        probability: Number(r.probability),
        rating: Number(r.rating ?? 1200),
        eval_ms: Number(r.eval_ms ?? 0),
        created_at: r.created_at,
      })),
      (actions.data ?? []).map((a) => ({
        user_id: a.user_id,
        action: a.action,
        automatic: a.automatic,
        created_at: a.created_at,
      })),
    );
  });

/**
 * Unified Fair Play audit trail: every automatic per-game verdict plus every
 * enforcement/admin decision, newest first. Reasons are the general,
 * player-safe strings — never raw detection signals.
 */
export const listFairplayDecisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid().optional(),
        gameId: z.string().uuid().optional(),
        /** "all" | "verdict" (per-game scoring) | "action" (enforcement) */
        kind: z.enum(["all", "verdict", "action"]).default("all"),
        /** Only decisions at or above this suspicion score. */
        minScore: z.number().int().min(0).max(100).default(0),
        limit: z.number().int().min(20).max(500).default(200),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertFairplayAdmin(context);

    let reportQuery = context.supabase
      .from("fairplay_reports")
      .select("id, user_id, game_id, score, probability, confidence, action, reasons, eval_ms, rating, created_at")
      .gte("score", data.minScore)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    let actionQuery = context.supabase
      .from("fairplay_actions")
      .select("id, user_id, game_id, action, score, automatic, note, decided_by, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.userId) {
      reportQuery = reportQuery.eq("user_id", data.userId);
      actionQuery = actionQuery.eq("user_id", data.userId);
    }
    if (data.gameId) {
      reportQuery = reportQuery.eq("game_id", data.gameId);
      actionQuery = actionQuery.eq("game_id", data.gameId);
    }

    const [reports, actions] = await Promise.all([
      data.kind === "action" ? Promise.resolve({ data: [] as never[] }) : reportQuery,
      data.kind === "verdict" ? Promise.resolve({ data: [] as never[] }) : actionQuery,
    ]);

    const reportRows = reports.data ?? [];
    const actionRows = actions.data ?? [];

    const userIds = [
      ...new Set([...reportRows.map((r) => r.user_id), ...actionRows.map((a) => a.user_id)]),
    ];
    const { data: profiles } = userIds.length
      ? await context.supabase.from("profiles").select("id, display_name, rating").in("id", userIds)
      : { data: [] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

    const asReasons = (value: unknown) =>
      Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

    const entries = [
      ...reportRows.map((r) => ({
        id: `report:${r.id}`,
        kind: "verdict" as const,
        createdAt: r.created_at,
        userId: r.user_id,
        displayName: byId.get(r.user_id)?.display_name ?? "Người chơi",
        rating: r.rating ?? byId.get(r.user_id)?.rating ?? null,
        gameId: r.game_id,
        action: r.action,
        score: Number(r.score),
        confidence: Number(r.confidence ?? 0),
        probability: Number(r.probability ?? 0),
        automatic: true,
        evalMs: Number(r.eval_ms ?? 0),
        reasons: asReasons(r.reasons),
        note: null as string | null,
      })),
      ...actionRows.map((a) => ({
        id: `action:${a.id}`,
        kind: "action" as const,
        createdAt: a.created_at,
        userId: a.user_id,
        displayName: byId.get(a.user_id)?.display_name ?? "Người chơi",
        rating: byId.get(a.user_id)?.rating ?? null,
        gameId: a.game_id,
        action: a.action,
        score: Number(a.score),
        confidence: 1,
        probability: 0,
        automatic: a.automatic,
        evalMs: 0,
        reasons: [] as string[],
        note: a.note,
      })),
    ].sort((x, y) => y.createdAt.localeCompare(x.createdAt));

    const { recordAdminAction } = await import("@/lib/admin/auditLog.server");
    await recordAdminAction({
      actorId: context.userId,
      action: "decision_log_view",
      targetUserId: data.userId ?? null,
      targetGameId: data.gameId ?? null,
      detail: { kind: data.kind, minScore: data.minScore, results: entries.length },
    });

    return entries.slice(0, data.limit);

  });
