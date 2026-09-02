/**
 * Server functions for the Nine64 AI Player Network.
 *
 * Client-safe module: the strength mapping, the seed routine and the engine
 * client are all dynamically imported inside handlers so nothing server-only
 * reaches the browser bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AiTurnResult } from "./types";

const GAME_ID = z.object({ gameId: z.string().uuid() });

/**
 * Nudge: asks the server to play the AI's move for a game the caller is in.
 * Idempotent and version-guarded, so spamming it cannot produce extra moves.
 */
export const requestAiTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GAME_ID.parse(input))
  .handler(async ({ data, context }): Promise<AiTurnResult> => {
    const { enforceRateLimit, userSubject } = await import("@/lib/ratelimit/limiter.server");
    await enforceRateLimit("rankedai.turn", userSubject(context.userId));

    // Only a participant may drive the AI seat of their own game.
    const { data: game, error } = await context.supabase
      .from("games")
      .select("id, white_id, black_id, ai_game")
      .eq("id", data.gameId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!game) return { code: "GAME_NOT_FOUND", gameId: data.gameId };
    if (game.white_id !== context.userId && game.black_id !== context.userId) {
      return { code: "GAME_NOT_FOUND", gameId: data.gameId };
    }
    if (!game.ai_game) return { code: "NOT_AN_AI_GAME", gameId: data.gameId };

    const { getSetting } = await import("@/lib/system/settings.server");
    if (!(await getSetting("ranked_ai_enabled"))) {
      return { code: "DISABLED", gameId: data.gameId };
    }

    const { playAiTurn } = await import("./aiTurn.server");
    return playAiTurn(data.gameId);
  });

export interface AiRosterStatus {
  total: number;
  enabled: number;
  activeGames: number;
  settings: { enabled: boolean; fallbackDelayMs: number; rolloutPercent: number };
}

/** Admin view of the roster; no engine internals are exposed. */
export const getAiRosterStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiRosterStatus> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getSetting } = await import("@/lib/system/settings.server");

    const [{ count: total }, { count: enabled }, { count: activeGames }] = await Promise.all([
      supabaseAdmin.from("ai_players").select("ai_key", { count: "exact", head: true }),
      supabaseAdmin.from("ai_players").select("ai_key", { count: "exact", head: true }).eq("enabled", true),
      supabaseAdmin.from("games").select("id", { count: "exact", head: true }).eq("ai_game", true).eq("status", "active"),
    ]);

    return {
      total: total ?? 0,
      enabled: enabled ?? 0,
      activeGames: activeGames ?? 0,
      settings: {
        enabled: await getSetting("ranked_ai_enabled"),
        fallbackDelayMs: await getSetting("ranked_ai_fallback_delay_ms"),
        rolloutPercent: await getSetting("ranked_ai_rollout_percent"),
      },
    };
  });

/** Idempotent seeding of the 100 AI identities. Admin only. */
export const seedAiRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { enforceRateLimit, userSubject } = await import("@/lib/ratelimit/limiter.server");
    await enforceRateLimit("rankedai.seed", userSubject(context.userId));

    const { seedRankedAiRoster } = await import("./seed.server");
    return seedRankedAiRoster();
  });
