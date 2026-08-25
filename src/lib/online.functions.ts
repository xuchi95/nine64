import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Game, GameMove, MatchmakingQueue, Notification } from "@/lib/database.types";
import {
  FINISH_GAME_SCHEMA,
  GAME_ID_SCHEMA,
  MOVE_SCHEMA,
  NOTIFICATION_ID_SCHEMA,
  QUEUE_SCHEMA,
  TRY_MATCH_SCHEMA,
  startingFenForVariant,
} from "@/lib/online.helpers";

export type MoveConflictReason = "stale_position" | "not_your_turn" | "game_over";

export type MoveCommitResult = {
  applied: boolean;
  reason: "ok" | MoveConflictReason;
  currentFen: string;
  status: string;
  result: string;
  whiteTimeMs: number;
  blackTimeMs: number;
  ply: number;
};
export const joinQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => QUEUE_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    // Cancel any existing waiting entry for this user
    await supabase
      .from("matchmaking_queue")
      .update({ status: "cancelled" })
      .eq("user_id", context.userId)
      .eq("status", "waiting");

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("rating")
      .eq("id", context.userId)
      .single();

    if (profileError) throw new Error(profileError.message);

    const { data: entry, error } = await supabase
      .from("matchmaking_queue")
      .insert({
        user_id: context.userId,
        rating: profile?.rating ?? 1200,
        variant: data.variant,
        time_control: data.timeControl,
        status: "waiting",
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return entry as MatchmakingQueue;
  });

export const leaveQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("matchmaking_queue")
      .update({ status: "cancelled" })
      .eq("user_id", context.userId)
      .eq("status", "waiting");

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const tryMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TRY_MATCH_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    // Validate ownership through the authenticated request client. This keeps
    // the security boundary tied to the caller's session before privileged
    // match creation is used for cross-user writes.
    const { data: myEntry, error: myError } = await supabase
      .from("matchmaking_queue")
      .select("*")
      .eq("id", data.queueId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (myError) throw new Error(myError.message);
    if (!myEntry) throw new Error("Queue entry not found");
    const matchedGameId = myEntry.matched_game_id;
    if (myEntry.status === "matched" && typeof matchedGameId === "string") {
      const { data: matchedGame, error: matchedGameError } = await supabase
        .from("games")
        .select("*")
        .eq("id", matchedGameId)
        .maybeSingle();

      if (matchedGameError) throw new Error(matchedGameError.message);
      return { game: (matchedGame as Game | null) ?? null };
    }
    if (myEntry.status !== "waiting") return { game: null as Game | null };

    const entry = myEntry as MatchmakingQueue;

    // Heartbeat this browser tab's search. The database matcher ignores stale
    // waiting rows so abandoned tabs cannot absorb fresh players into phantom games.
    const { error: heartbeatError } = await supabase
      .from("matchmaking_queue")
      .update({ status: "waiting" })
      .eq("id", entry.id)
      .eq("user_id", context.userId)
      .eq("status", "waiting");

    if (heartbeatError) throw new Error(heartbeatError.message);

    // Match creation must be atomic across two queue rows, one game row and two
    // notifications. The server validates the caller first, then invokes the
    // service-only RPC so the database can lock both queue rows consistently.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const startFen = startingFenForVariant(entry.variant);

    const { data: gameId, error: matchError } = await supabaseAdmin.rpc("create_online_match", {
      _queue_id: entry.id,
      _user_id: context.userId,
      _initial_fen: startFen,
      _white_is_requester: Math.random() < 0.5,
    });

    if (matchError) throw new Error(matchError.message);
    if (!gameId || typeof gameId !== "string") {
      return { game: null as Game | null };
    }

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("*")
      .eq("id", gameId)
      .maybeSingle();

    if (gameError || !game) throw new Error(gameError?.message || "Failed to load created game");
    return { game: game as Game };
  });

/**
 * Từ chối ván vừa ghép: huỷ ván, thông báo cho đối thủ và đưa đối thủ trở lại
 * hàng chờ, đồng thời trả về cấu hình để người từ chối tự vào lại hàng chờ.
 */
export const declineMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GAME_ID_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id, white_id, black_id, variant, time_control, status")
      .eq("id", data.gameId)
      .maybeSingle();

    if (gameError) throw new Error(gameError.message);
    if (!game) throw new Error("Game not found");
    if (game.white_id !== context.userId && game.black_id !== context.userId) {
      throw new Error("Forbidden");
    }

    const opponentId = game.white_id === context.userId ? game.black_id : game.white_id;
    const variant = game.variant;
    const timeControl = game.time_control;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Không huỷ ván đã đi quân hoặc đã kết thúc.
    const { count: moveCount } = await supabaseAdmin
      .from("game_moves")
      .select("id", { count: "exact", head: true })
      .eq("game_id", game.id);

    const abortable = game.status !== "completed" && (moveCount ?? 0) === 0;

    if (abortable) {
      await supabaseAdmin
        .from("games")
        .update({ status: "aborted", result: "*", end_reason: "declined" })
        .eq("id", game.id)
        .neq("status", "completed");
    }

    // Dọn hàng chờ của cả hai bên cho ván này.
    await supabaseAdmin
      .from("matchmaking_queue")
      .update({ status: "cancelled" })
      .eq("matched_game_id", game.id);

    await supabaseAdmin
      .from("matchmaking_queue")
      .update({ status: "cancelled" })
      .in("user_id", [context.userId, opponentId])
      .eq("status", "waiting");

    if (abortable) {
      // Đối thủ được tự động xếp lại hàng chờ với cùng cấu hình.
      const { data: opponentProfile } = await supabaseAdmin
        .from("profiles")
        .select("rating")
        .eq("id", opponentId)
        .maybeSingle();

      await supabaseAdmin.from("matchmaking_queue").insert({
        user_id: opponentId,
        rating: opponentProfile?.rating ?? 1200,
        variant,
        time_control: timeControl,
        status: "waiting",
      });

      await supabaseAdmin.from("notifications").insert({
        user_id: opponentId,
        type: "match_declined",
        title: "Đối thủ đã từ chối ván",
        body: "Ván ghép đã bị huỷ. Bạn được đưa trở lại hàng chờ để tìm đối thủ khác.",
        data: { gameId: game.id, variant, timeControl },
      });
    }

    return { ok: true, aborted: abortable, variant, timeControl };
  });

export const getGame = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GAME_ID_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    const { data: game, error } = await context.supabase
      .from("games")
      .select("*")
      .eq("id", data.gameId)
      .single();

    if (error) throw new Error(error.message);
    return game as Game;
  });

export const getGameMoves = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GAME_ID_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    const { data: moves, error } = await context.supabase
      .from("game_moves")
      .select("*")
      .eq("game_id", data.gameId)
      .order("move_number", { ascending: true });

    if (error) throw new Error(error.message);
    return (moves ?? []) as GameMove[];
  });

export const makeMove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MOVE_SCHEMA.parse(input))
  .handler(async ({ data, context }): Promise<MoveCommitResult> => {
    const supabase = context.supabase;

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("*")
      .eq("id", data.gameId)
      .single();

    if (gameError || !game) throw new Error(gameError?.message || "Game not found");

    const isWhite = game.white_id === context.userId;
    if (!isWhite && game.black_id !== context.userId) throw new Error("Not a player in this game");

    // Atomic, conflict-aware commit: the DB locks the game row, verifies the
    // client's base position and assigns the ply number in one transaction.
    const { data: raw, error: rpcError } = await supabase.rpc("commit_move", {
      _game_id: data.gameId,
      _base_fen: data.baseFen,
      _san: data.san,
      _uci: data.uci,
      _fen: data.fen,
      _white_time_ms: data.whiteTimeMs,
      _black_time_ms: data.blackTimeMs,
    });

    if (rpcError) {
      // Losing side of a unique-ply race: treat as a conflict, not a hard failure.
      if (rpcError.code === "23505") {
        const { data: fresh } = await supabase
          .from("games")
          .select("current_fen, status, result, white_time_ms, black_time_ms")
          .eq("id", data.gameId)
          .single();
        const { count } = await supabase
          .from("game_moves")
          .select("*", { count: "exact", head: true })
          .eq("game_id", data.gameId);
        return {
          applied: false,
          reason: "stale_position",
          currentFen: fresh?.current_fen ?? game.current_fen,
          status: fresh?.status ?? game.status,
          result: fresh?.result ?? game.result,
          whiteTimeMs: fresh?.white_time_ms ?? game.white_time_ms,
          blackTimeMs: fresh?.black_time_ms ?? game.black_time_ms,
          ply: count ?? 0,
        };
      }
      throw new Error(rpcError.message);
    }

    const payload = (raw ?? {}) as Record<string, unknown>;
    const outcome: MoveCommitResult = {
      applied: payload["applied"] === true,
      reason: (payload["reason"] as MoveCommitResult["reason"]) ?? "stale_position",
      currentFen: (payload["current_fen"] as string) ?? game.current_fen,
      status: (payload["status"] as string) ?? game.status,
      result: (payload["result"] as string) ?? game.result,
      whiteTimeMs: Number(payload["white_time_ms"] ?? game.white_time_ms),
      blackTimeMs: Number(payload["black_time_ms"] ?? game.black_time_ms),
      ply: Number(payload["ply"] ?? 0),
    };

    if (!outcome.applied) return outcome;

    // Notify opponent
    const opponentId = isWhite ? game.black_id : game.white_id;
    await supabase.from("notifications").insert({
      user_id: opponentId,
      type: "move",
      title: "Your move",
      body: `Your opponent played ${data.san}.`,
      data: { game_id: data.gameId },
    });

    return outcome;
  });


export const finishGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => FINISH_GAME_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("*")
      .eq("id", data.gameId)
      .single();

    if (gameError || !game) throw new Error(gameError?.message || "Game not found");
    if (game.status === "completed") return { ok: true };

    const { error } = await supabase
      .from("games")
      .update({
        status: "completed",
        result: data.result,
        winner_id: data.winnerId,
        end_reason: data.endReason,
        current_fen: data.finalFen,
      })
      .eq("id", data.gameId);

    if (error) throw new Error(error.message);

    // Glicko-2 rating update (rating, deviation and volatility) — service role only.
    const draw = data.result === "1/2-1/2";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: ratingError } = await supabaseAdmin.rpc("apply_glicko2", { _game_id: data.gameId });
    if (ratingError) console.error("Glicko-2 update failed", ratingError.message);


    // Notify both players
    const title = draw ? "Game drawn" : data.winnerId ? "You won!" : "Game over";
    const body = draw
      ? "The game ended in a draw."
      : data.winnerId
        ? "Check the result in My games."
        : "The game ended.";

    await supabase.from("notifications").insert([
      { user_id: game.white_id, type: "game_over", title, body, data: { game_id: data.gameId } },
      { user_id: game.black_id, type: "game_over", title, body, data: { game_id: data.gameId } },
    ]);

    return { ok: true };
  });

export const getMyGames = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("games")
      .select("*")
      .or(`white_id.eq.${context.userId},black_id.eq.${context.userId}`)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    return (data ?? []) as Game[];
  });

export const getNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);
    return (data ?? []) as Notification[];
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => NOTIFICATION_ID_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", data.id)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
