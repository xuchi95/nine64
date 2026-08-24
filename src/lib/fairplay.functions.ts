import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { evaluateGame, loadTurns, upsertReport, refreshStatus, enforce } from "@/lib/fairplay/apply.server";

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

const observationSchema = z.object({
  ply: z.number().int().min(0),
  isTop1: z.boolean(),
  loss: z.number().min(0).max(100),
  complexity: z.number().min(0).max(1),
  accuracy: z.number().min(0).max(100),
  spentMs: z.number().min(0).max(3_600_000).nullable(),
});

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
    const { error } = await context.supabase.from("fairplay_signals").upsert(
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
 * Analyse one side of a finished game. Either player may submit the engine
 * analysis (cross-checking), but behavioural telemetry is always read from the
 * subject's own submission and the strongest verdict wins.
 */
export const reportFairplayGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        gameId: z.string().uuid(),
        subjectId: z.string().uuid(),
        observations: z.array(observationSchema).min(1).max(400),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: game, error } = await context.supabase
      .from("games")
      .select("id, white_id, black_id, white_rating, black_rating, status")
      .eq("id", data.gameId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!game) throw new Error("Game not found");
    if (game.white_id !== context.userId && game.black_id !== context.userId) {
      throw new Error("Forbidden");
    }
    if (game.white_id !== data.subjectId && game.black_id !== data.subjectId) {
      throw new Error("Subject is not a player in this game");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rating = game.white_id === data.subjectId ? game.white_rating : game.black_rating;
    const turns = await loadTurns(supabaseAdmin, data.gameId, data.subjectId);
    const verdict = evaluateGame({ observations: data.observations, turns, rating });

    const stored = await upsertReport(
      supabaseAdmin,
      { gameId: data.gameId, subjectId: data.subjectId, observations: data.observations, rating },
      verdict,
    );
    if (stored.stored) {
      await enforce(supabaseAdmin, {
        userId: data.subjectId,
        gameId: data.gameId,
        action: verdict.action,
        score: verdict.score,
      });
    }
    const status = await refreshStatus(supabaseAdmin, data.subjectId);

    return {
      score: stored.score,
      action: verdict.action,
      statusAction: status.action,
      ratingLocked: status.locked,
      self: data.subjectId === context.userId,
    };
  });

export const getMyFairplayStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fairplay_status")
      .select("score, action, rating_locked, games_reviewed, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const listFairplayCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data, error } = await context.supabase
      .from("fairplay_status")
      .select(
        "user_id, score, action, sprt_llr, sprt_decision, boosting_score, sandbagging_score, rating_locked, games_reviewed, reasons, updated_at",
      )
      .order("score", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const ids = (data ?? []).map((r) => r.user_id);
    const { data: profiles } = ids.length
      ? await context.supabase.from("profiles").select("id, display_name, rating").in("id", ids)
      : { data: [] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

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
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

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
        decision: z.enum(["clear", "rating_hold"]),
        note: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("fairplay_status")
      .upsert(
        {
          user_id: data.userId,
          rating_locked: data.decision === "rating_hold",
          action: data.decision === "rating_hold" ? "rating_hold" : "none",
          score: data.decision === "rating_hold" ? 100 : 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    await supabaseAdmin.from("fairplay_actions").insert({
      user_id: data.userId,
      action: data.decision === "rating_hold" ? "rating_hold" : "cleared",
      score: data.decision === "rating_hold" ? 100 : 0,
      automatic: false,
      decided_by: context.userId,
      note: data.note ?? null,
    });

    return { ok: true };
  });
