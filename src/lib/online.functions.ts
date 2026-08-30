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
import {
  applyIntent,
  sideToMoveFromFen,
  type MoveErrorCode,
} from "@/lib/online/moveEngine";

export type { MoveErrorCode } from "@/lib/online/moveEngine";

/** Canonical result of a move attempt. Clocks always come from the server. */
export type MoveOutcome =
  | { ok: true; game: Game; move: GameMove; serverNow: string }
  | { ok: false; code: MoveErrorCode; game?: Game; serverNow?: string };

/** Canonical clock snapshot the UI counts down from. */
export type GameSnapshot = {
  game: Game;
  serverNow: string;
  activeSide: "w" | "b";
};

export const joinQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => QUEUE_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    // Queue rows are not client-writable: the RPC stamps rating, status and
    // ownership from auth.uid() and enforces one waiting entry per user.
    const { data: entry, error } = await context.supabase.rpc("queue_join", {
      _variant: data.variant,
      _time_control: data.timeControl,
    });

    if (error) throw new Error(error.message);
    return entry as unknown as MatchmakingQueue;
  });

export const leaveQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("queue_leave");
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
    const { error: heartbeatError } = await supabase.rpc("queue_heartbeat", {
      _queue_id: entry.id,
    });

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

/**
 * Canonical move pipeline. The client only sends an intent; the server owns
 * validation, SAN/UCI/FEN generation, clocks, result and version bumping.
 */
export const makeMove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MOVE_SCHEMA.parse(input))
  .handler(async ({ data, context }): Promise<MoveOutcome> => {
    const supabase = context.supabase;

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("*")
      .eq("id", data.gameId)
      .maybeSingle();

    if (gameError) throw new Error(gameError.message);
    if (!game) return { ok: false, code: "GAME_NOT_FOUND" };

    const isWhite = game.white_id === context.userId;
    const isBlack = game.black_id === context.userId;
    if (!isWhite && !isBlack) return { ok: false, code: "NOT_A_PARTICIPANT" };

    const snapshot = game as Game;
    if (snapshot.status !== "active") {
      return { ok: false, code: "GAME_NOT_ACTIVE", game: snapshot };
    }
    if (snapshot.version !== data.expectedVersion) {
      return { ok: false, code: "STALE_GAME_VERSION", game: snapshot };
    }
    if ((sideToMoveFromFen(snapshot.current_fen) === "w") !== isWhite) {
      return { ok: false, code: "NOT_YOUR_TURN", game: snapshot };
    }

    const canonical = applyIntent(
      snapshot.current_fen,
      data.from,
      data.to,
      data.promotion,
    );
    if (!canonical) return { ok: false, code: "ILLEGAL_MOVE", game: snapshot };

    let outcome: "none" | "checkmate" | "draw" = "none";
    let endReason: string | null = null;

    if (canonical.isCheckmate) {
      outcome = "checkmate";
      endReason = "Checkmate";
    } else if (canonical.isDraw) {
      outcome = "draw";
      endReason = canonical.isStalemate
        ? "Stalemate"
        : canonical.isInsufficientMaterial
          ? "Insufficient material"
          : canonical.isThreefold
            ? "Threefold repetition"
            : "Draw";
    }

    // Atomic commit: the RPC re-locks the row, re-checks version/turn, derives
    // both clocks from the *database* timestamp, inserts the move and bumps the
    // version by exactly one in a single transaction. No caller-supplied clock.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: raw, error: rpcError } = await supabaseAdmin.rpc("commit_move_internal", {
      _game_id: data.gameId,
      _user_id: context.userId,
      _expected_version: data.expectedVersion,
      _san: canonical.san,
      _uci: canonical.uci,
      _fen: canonical.fen,
      _outcome: outcome,
      // Generated types don't model nullable args; the RPC treats NULL as "unchanged".
      _end_reason: endReason as unknown as string,
    });

    if (rpcError) throw new Error(rpcError.message);

    const payload = (raw ?? {}) as {
      ok?: boolean;
      code?: MoveErrorCode;
      game?: Game;
      move?: GameMove;
      server_now?: string;
    };

    const serverNow = payload.server_now ?? new Date().toISOString();

    if (!payload.ok || !payload.game || !payload.move) {
      return {
        ok: false,
        code: payload.code ?? "INTERNAL_ERROR",
        game: payload.game ?? snapshot,
        serverNow,
      };
    }


    const committedGame = payload.game;
    const opponentId = isWhite ? snapshot.black_id : snapshot.white_id;

    if (committedGame.status === "completed") {
      const { error: ratingError } = await supabaseAdmin.rpc("apply_glicko2", {
        _game_id: data.gameId,
      });
      if (ratingError) console.error("Glicko-2 update failed", ratingError.message);

      const title = committedGame.result === "1/2-1/2" ? "Game drawn" : "Game over";
      await supabaseAdmin.from("notifications").insert([

        {
          user_id: snapshot.white_id,
          type: "game_over",
          title,
          body: endReason ?? "The game ended.",
          data: { game_id: data.gameId },
        },
        {
          user_id: snapshot.black_id,
          type: "game_over",
          title,
          body: endReason ?? "The game ended.",
          data: { game_id: data.gameId },
        },
      ]);
    } else {
      await supabaseAdmin.from("notifications").insert({
        user_id: opponentId,
        type: "move",
        title: "Your move",
        body: `Your opponent played ${canonical.san}.`,
        data: { game_id: data.gameId },
      });
    }

    return { ok: true, game: committedGame, move: payload.move, serverNow };
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
    if (game.white_id !== context.userId && game.black_id !== context.userId) {
      throw new Error("Forbidden");
    }
    if (game.status === "completed") return { ok: true };

    // The caller may only *declare* an agreed result; the winner is derived
    // server-side and the canonical FEN is never taken from the client.
    const result = data.result;
    const winnerId =
      result === "1-0" ? game.white_id : result === "0-1" ? game.black_id : null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("games")
      .update({
        status: "completed",
        result,
        winner_id: winnerId,
        end_reason: data.endReason.slice(0, 120),
        clock_state: "stopped",
        turn_started_at: null,
      })
      .eq("id", data.gameId)
      .neq("status", "completed");

    if (error) throw new Error(error.message);

    // Glicko-2 rating update (rating, deviation and volatility) — service role only.
    const draw = result === "1/2-1/2";

    const { error: ratingError } = await supabaseAdmin.rpc("apply_glicko2", { _game_id: data.gameId });
    if (ratingError) console.error("Glicko-2 update failed", ratingError.message);

    // Notify both players
    const title = draw ? "Game drawn" : winnerId ? "Game over" : "Game over";
    const body = draw
      ? "The game ended in a draw."
      : winnerId
        ? "Check the result in My games."
        : "The game ended.";

    await supabaseAdmin.from("notifications").insert([
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

/**
 * Canonical clock/state sync. The UI never trusts its own clock: it renders a
 * countdown derived from these server values plus a local monotonic delta.
 * Also finalizes an expired game on the spot (idempotent), so a flag fall is
 * resolved as soon as anyone looks at the board.
 */
export const syncGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GAME_ID_SCHEMA.parse(input))
  .handler(async ({ data, context }): Promise<GameSnapshot> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: raw, error } = await supabaseAdmin.rpc("finalize_game_timeout", {
      _game_id: data.gameId,
    });
    if (error) throw new Error(error.message);

    const payload = (raw ?? {}) as { game?: Game; server_now?: string; code?: string };
    if (!payload.game) throw new Error("Game not found");

    const game = payload.game;
    if (game.white_id !== context.userId && game.black_id !== context.userId) {
      throw new Error("Not a participant");
    }

    return {
      game,
      serverNow: payload.server_now ?? new Date().toISOString(),
      activeSide: sideToMoveFromFen(game.current_fen),
    };
  });
