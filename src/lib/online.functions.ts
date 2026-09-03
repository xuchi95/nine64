import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DrawOffer, Game, GameMove, MatchmakingQueue, Notification } from "@/lib/database.types";
import {
  DRAW_OFFER_SCHEMA,
  DRAW_RESPONSE_SCHEMA,
  GAME_COMMAND_SCHEMA,
  GAME_DELTA_SCHEMA,
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
  | { ok: true; game: Game; move: GameMove; serverNow: string; aiToMove?: boolean }
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
    const { enforceRateLimit, userSubject } = await import("@/lib/ratelimit/limiter.server");
    await enforceRateLimit("matchmaking.join", userSubject(context.userId));
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
    const { enforceRateLimit, userSubject } = await import("@/lib/ratelimit/limiter.server");
    await enforceRateLimit("matchmaking.leave", userSubject(context.userId));
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
    let resolvedGameId = typeof gameId === "string" ? gameId : null;

    // Human-first: only when no real opponent could be paired do we consider an
    // AI seat, and only after the configured grace period, for users inside the
    // rollout, with the feature explicitly enabled.
    if (!resolvedGameId) {
      const { getSetting } = await import("@/lib/system/settings.server");
      if (await getSetting("ranked_ai_enabled")) {
        const { inRankedAiRollout } = await import("@/lib/rankedAi/rollout");
        const percent = await getSetting("ranked_ai_rollout_percent");
        if (inRankedAiRollout(context.userId, percent)) {
          const delayMs = await getSetting("ranked_ai_fallback_delay_ms");
          const { data: aiGameId, error: aiError } = await supabaseAdmin.rpc("create_ai_match", {
            _queue_id: entry.id,
            _user_id: context.userId,
            _initial_fen: startFen,
            _white_is_requester: Math.random() < 0.5,
            _min_wait_ms: delayMs,
          });
          if (aiError) console.error("AI fallback match failed", aiError.message);
          else if (typeof aiGameId === "string") resolvedGameId = aiGameId;
        }
      }
    }

    if (!resolvedGameId) {
      return { game: null as Game | null };
    }


    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("*")
      .eq("id", resolvedGameId)
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

      await supabaseAdmin.rpc("enqueue_notification", {
        _event_type: "match_declined",
        _event_key: `match_declined:${game.id}:${opponentId}`,
        _recipient: opponentId,
        _game_id: game.id,
        _actor_id: context.userId,
        _payload: { variant, time_control: timeControl },
      });
      await kickNotificationOutbox();
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

export type GamePlayerNames = {
  whiteName: string;
  blackName: string;
  /** True when that seat is a Nine64 AI opponent (always disclosed in the UI). */
  whiteIsAi: boolean;
  blackIsAi: boolean;
};

/** Display names for both seats. Authenticated users may read profiles, and
 *  the caller must be a participant — never leak names to spectators of
 *  private games through this path. */
export const getGamePlayers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GAME_ID_SCHEMA.parse(input))
  .handler(async ({ data, context }): Promise<GamePlayerNames> => {
    const { data: game, error } = await context.supabase
      .from("games")
      .select("white_id, black_id")
      .eq("id", data.gameId)
      .single();
    if (error || !game) throw new Error("Game not found");
    if (game.white_id !== context.userId && game.black_id !== context.userId) {
      throw new Error("Not a participant");
    }
    const { data: rows, error: pErr } = await context.supabase
      .from("profiles")
      .select("id, display_name, is_ai")
      .in("id", [game.white_id, game.black_id]);
    if (pErr) throw new Error(pErr.message);
    const names = new Map((rows ?? []).map((r) => [r.id as string, r.display_name as string]));
    const aiSeats = new Set((rows ?? []).filter((r) => r.is_ai).map((r) => r.id as string));
    return {
      whiteName: names.get(game.white_id) ?? game.white_id.slice(0, 8),
      blackName: names.get(game.black_id) ?? game.black_id.slice(0, 8),
      whiteIsAi: aiSeats.has(game.white_id),
      blackIsAi: aiSeats.has(game.black_id),
    };
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

    // Only the columns the pre-flight validation needs. The canonical, full
    // row always comes back from commit_move_internal, so pulling `*` here just
    // shipped the whole (pgn-carrying) row across the wire on every move.
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id, white_id, black_id, status, version, current_fen, variant")
      .eq("id", data.gameId)
      .maybeSingle();


    if (gameError) throw new Error(gameError.message);
    if (!game) return { ok: false, code: "GAME_NOT_FOUND" };

    const isWhite = game.white_id === context.userId;
    const isBlack = game.black_id === context.userId;
    if (!isWhite && !isBlack) return { ok: false, code: "NOT_A_PARTICIPANT" };

    // Pre-flight snapshot: only the validation columns, so it is deliberately
    // NOT returned to the client. Rejections make the client resync canonically.
    const snapshot = game;
    if (snapshot.status !== "active") {
      return { ok: false, code: "GAME_NOT_ACTIVE" };
    }
    if (snapshot.version !== data.expectedVersion) {
      return { ok: false, code: "STALE_GAME_VERSION" };
    }
    if ((sideToMoveFromFen(snapshot.current_fen) === "w") !== isWhite) {
      return { ok: false, code: "NOT_YOUR_TURN" };
    }


    const canonical = applyIntent(
      snapshot.variant,
      snapshot.current_fen,
      data.from,
      data.to,
      data.promotion,
    );
    if (!canonical) return { ok: false, code: "ILLEGAL_MOVE" };

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
        ...(payload.game ? { game: payload.game } : {}),
        serverNow,
      };
    }


    const committedGame = payload.game;

    if (committedGame.status === "completed") {
      // Single orchestration path; safe to call at-least-once (ledger-guarded).
      const { error: ratingError } = await supabaseAdmin.rpc("apply_rating_once", {
        _game_id: data.gameId,
      });
      if (ratingError) console.error("Rating apply failed", ratingError.message);
    }

    // Hot path: the outbox drain is NOT awaited per move — it added a full
    // extra admin round trip to every single move. Notifications were already
    // enqueued transactionally by the database, and a move only produces one
    // when the game ends, so kick the drain there and nowhere else.
    if (committedGame.status === "completed") await kickNotificationOutbox();

    // Tell the client an AI seat now has to move, so it can nudge the server
    // turn processor. The nudge is idempotent and version-guarded.
    const aiToMove =
      committedGame.status === "active" &&
      Boolean((committedGame as { ai_game?: boolean }).ai_game);

    return { ok: true, game: committedGame, move: payload.move, serverNow, aiToMove };
  });



/**
 * Canonical terminal commands (P0.5). The client may only *name the action*;
 * result, winner, end reason and final position are always derived server-side
 * inside a locked transaction, applied exactly once, and rated via
 * `apply_rating_once`.
 */
export type CommandCode =
  | "RESIGNED"
  | "ABORTED"
  | "FLAGGED"
  | "ALREADY_FINAL"
  | "STILL_RUNNING"
  | "GAME_NOT_FOUND"
  | "NOT_A_PARTICIPANT"
  | "GAME_NOT_ACTIVE"
  | "STALE_GAME_VERSION"
  | "ABORT_NOT_ALLOWED"
  | "INVALID_INPUT";

export type CommandOutcome = {
  ok: boolean;
  code: CommandCode;
  game: Game | null;
  serverNow: string;
};

type RawCommandPayload = {
  ok?: boolean;
  code?: CommandCode;
  game?: Game;
  server_now?: string;
};

async function runGameCommand(
  rpc: "resign_game_internal" | "claim_timeout_internal" | "abort_game_internal",
  gameId: string,
  userId: string,
  expectedVersion: number,
): Promise<CommandOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: raw, error } = await supabaseAdmin.rpc(rpc, {
    _game_id: gameId,
    _user_id: userId,
    _expected_version: expectedVersion,
  });
  if (error) throw new Error(error.message);

  const payload = (raw ?? {}) as RawCommandPayload;
  return {
    ok: payload.ok ?? false,
    code: payload.code ?? "GAME_NOT_FOUND",
    game: payload.game ?? null,
    serverNow: payload.server_now ?? new Date().toISOString(),
  };
}

/**
 * Game-over notifications are enqueued transactionally by the database
 * (notification_outbox). This only kicks the processor for low latency.
 */
async function kickNotificationOutbox() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("process_notification_outbox", { _limit: 50 });
    if (error) console.error("Notification outbox kick failed", error.message);
  } catch (err) {
    console.error("Notification outbox kick failed", err);
  }
}

/** Resign: only the caller can lose; the opponent is derived by the server. */
export const resignGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GAME_COMMAND_SCHEMA.parse(input))
  .handler(async ({ data, context }): Promise<CommandOutcome> => {
    const out = await runGameCommand(
      "resign_game_internal",
      data.gameId,
      context.userId,
      data.expectedVersion,
    );
    if (out.code === "RESIGNED") await kickNotificationOutbox();
    return out;
  });

/** Claim a flag fall. The ruling comes from the database clock, never the UI. */
export const claimTimeout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GAME_COMMAND_SCHEMA.parse(input))
  .handler(async ({ data, context }): Promise<CommandOutcome> => {
    const out = await runGameCommand(
      "claim_timeout_internal",
      data.gameId,
      context.userId,
      data.expectedVersion,
    );
    if (out.code === "FLAGGED") await kickNotificationOutbox();
    return out;
  });

/** Abort: allowed only while the game has no committed move. Never rated. */
export const abortGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GAME_COMMAND_SCHEMA.parse(input))
  .handler(async ({ data, context }): Promise<CommandOutcome> =>
    runGameCommand("abort_game_internal", data.gameId, context.userId, data.expectedVersion),
  );

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
    await kickNotificationOutbox();
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
    const { enforceRateLimit, userSubject } = await import("@/lib/ratelimit/limiter.server");
    await enforceRateLimit("notification.action", userSubject(context.userId));
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

/** Snapshot + only the moves the client is missing. */
export type GameDelta = GameSnapshot & {
  /** Moves with move_number > sinceMoveNumber, ordered. Empty when in sync. */
  moves: GameMove[];
  /** True when the caller asked for a full reload (sinceMoveNumber < 0). */
  full: boolean;
};

/**
 * Single-round-trip sync for the live board (perf hot path).
 *
 * Replaces `syncGame` + `getGameMoves`: one HTTP request, one database call,
 * and only the moves the client has not seen. The RPC reads the game row
 * WITHOUT a lock and escalates to the locking timeout finalizer only when the
 * flag has actually fallen, so concurrent syncs from both players and every
 * spectator no longer serialize against each other or against move commits.
 */
export const syncGameState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GAME_DELTA_SCHEMA.parse(input))
  .handler(async ({ data, context }): Promise<GameDelta> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: raw, error } = await supabaseAdmin.rpc("sync_game_state", {
      _game_id: data.gameId,
      _since_move: data.sinceMoveNumber,
    });
    if (error) throw new Error(error.message);

    const payload = (raw ?? {}) as {
      ok?: boolean;
      game?: Game;
      moves?: GameMove[];
      server_now?: string;
    };
    if (!payload.ok || !payload.game) throw new Error("Game not found");

    const game = payload.game;
    if (game.white_id !== context.userId && game.black_id !== context.userId) {
      throw new Error("Not a participant");
    }

    return {
      game,
      moves: payload.moves ?? [],
      full: data.sinceMoveNumber < 0,
      serverNow: payload.server_now ?? new Date().toISOString(),
      activeSide: sideToMoveFromFen(game.current_fen),
    };
  });


/** Canonical rating ledger entry for a finished game (never recomputed client-side). */
export type RatingEvent = {
  game_id: string;
  white_id: string;
  black_id: string;
  result: string;
  white_rating_before: number;
  white_rating_after: number;
  white_delta: number;
  black_rating_before: number;
  black_rating_after: number;
  black_delta: number;
  algorithm: string;
  algorithm_version: number;
  created_at: string;
};

export const getRatingEvent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GAME_ID_SCHEMA.parse(input))
  .handler(async ({ data, context }): Promise<RatingEvent | null> => {
    const { data: row, error } = await context.supabase
      .from("rating_events")
      .select(
        "game_id, white_id, black_id, result, white_rating_before, white_rating_after, white_delta, black_rating_before, black_rating_after, black_delta, algorithm, algorithm_version, created_at",
      )
      .eq("game_id", data.gameId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (row as RatingEvent | null) ?? null;
  });

// ===== P0.6: draw offers =========================================
// Offering a draw never ends the game. Only the recipient accepting — or the
// canonical rules engine — can produce a drawn result.

export type DrawCommandCode =
  | "OFFER_CREATED"
  | "OFFER_EXISTS"
  | "OFFER_ALREADY_PENDING"
  | "OFFER_COOLDOWN"
  | "OFFER_NOT_FOUND"
  | "OFFER_NOT_PENDING"
  | "OFFER_EXPIRED"
  | "OFFER_ALREADY_RESOLVED"
  | "NOT_OFFER_RECIPIENT"
  | "NOT_OFFER_SENDER"
  | "DRAW_AGREED"
  | "DECLINED"
  | "CANCELLED"
  | "ALREADY_FINAL"
  | "GAME_NOT_FOUND"
  | "NOT_A_PARTICIPANT"
  | "GAME_NOT_ACTIVE"
  | "STALE_GAME_VERSION"
  | "INVALID_INPUT";

export type DrawCommandOutcome = {
  ok: boolean;
  code: DrawCommandCode;
  offer: DrawOffer | null;
  game: Game | null;
  retryAfterMs?: number;
};

function toDrawOutcome(raw: unknown): DrawCommandOutcome {
  const payload = (raw ?? {}) as {
    ok?: boolean;
    code?: DrawCommandCode;
    offer?: DrawOffer;
    game?: Game;
    retry_after_ms?: number;
  };
  return {
    ok: payload.ok ?? false,
    code: payload.code ?? "GAME_NOT_FOUND",
    offer: payload.offer ?? null,
    game: payload.game ?? null,
    ...(payload.retry_after_ms !== undefined ? { retryAfterMs: payload.retry_after_ms } : {}),
  };
}

/** Current pending offer (if any) plus the latest resolved one, for the UI. */
export const getDrawOffers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GAME_ID_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("game_draw_offers")
      .select("*")
      .eq("game_id", data.gameId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) throw new Error(error.message);
    const offers = (rows ?? []) as DrawOffer[];
    const pending =
      offers.find((o) => o.status === "pending" && Date.parse(o.expires_at) > Date.now()) ?? null;
    return { pending, latest: offers[0] ?? null };
  });

export const offerDraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DRAW_OFFER_SCHEMA.parse(input))
  .handler(async ({ data, context }): Promise<DrawCommandOutcome> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: raw, error } = await supabaseAdmin.rpc("offer_draw_internal", {
      _game_id: data.gameId,
      _user_id: context.userId,
      _expected_version: data.expectedVersion,
      _idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    const out = toDrawOutcome(raw);
    await kickNotificationOutbox();
    if (out.code === "OFFER_CREATED") {
      // A ranked-AI opponent answers like a human instead of ignoring the offer.
      try {
        const { maybeAiDrawResponse } = await import("@/lib/rankedAi/draw.server");
        await maybeAiDrawResponse(data.gameId);
      } catch (err) {
        console.error("[draw] ai response failed", err instanceof Error ? err.message : err);
      }
    }
    return out;
  });


export const acceptDraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DRAW_RESPONSE_SCHEMA.parse(input))
  .handler(async ({ data, context }): Promise<DrawCommandOutcome> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: raw, error } = await supabaseAdmin.rpc("accept_draw_internal", {
      _game_id: data.gameId,
      _offer_id: data.offerId,
      _user_id: context.userId,
      _expected_version: data.expectedVersion,
    });
    if (error) throw new Error(error.message);
    const out = toDrawOutcome(raw);
    if (out.code === "DRAW_AGREED") await kickNotificationOutbox();
    return out;
  });

export const declineDraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DRAW_RESPONSE_SCHEMA.parse(input))
  .handler(async ({ data, context }): Promise<DrawCommandOutcome> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: raw, error } = await supabaseAdmin.rpc("respond_draw_internal", {
      _game_id: data.gameId,
      _offer_id: data.offerId,
      _user_id: context.userId,
      _action: "decline",
    });
    if (error) throw new Error(error.message);
    const out = toDrawOutcome(raw);
    await kickNotificationOutbox();
    return out;
  });

export const cancelDraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DRAW_RESPONSE_SCHEMA.parse(input))
  .handler(async ({ data, context }): Promise<DrawCommandOutcome> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: raw, error } = await supabaseAdmin.rpc("respond_draw_internal", {
      _game_id: data.gameId,
      _offer_id: data.offerId,
      _user_id: context.userId,
      _action: "cancel",
    });
    if (error) throw new Error(error.message);
    const out = toDrawOutcome(raw);
    await kickNotificationOutbox();
    return out;
  });
