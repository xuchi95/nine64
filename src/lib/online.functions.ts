import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Game, GameMove, MatchmakingQueue, Notification } from "@/lib/database.types";

const QUEUE_SCHEMA = z.object({
  variant: z.string().min(1),
  timeControl: z.string().min(1),
});

const MOVE_SCHEMA = z.object({
  gameId: z.string().uuid(),
  san: z.string().min(1),
  uci: z.string().min(2),
  fen: z.string().min(10),
  whiteTimeMs: z.number().int().min(0),
  blackTimeMs: z.number().int().min(0),
});

const GAME_ID_SCHEMA = z.object({ gameId: z.string().uuid() });

function timeControlToMs(timeControl: string): number {
  switch (timeControl) {
    case "blitz1m":
      return 60_000;
    case "blitz3m":
      return 180_000;
    case "blitz5m":
      return 300_000;
    case "rapid10m":
      return 600_000;
    case "rapid15m":
      return 900_000;
    case "rapid30m":
      return 1_800_000;
    default:
      return 300_000;
  }
}

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
  .inputValidator((input) => z.object({ queueId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const { data: myEntry, error: myError } = await supabase
      .from("matchmaking_queue")
      .select("*")
      .eq("id", data.queueId)
      .eq("user_id", context.userId)
      .single();

    if (myError || !myEntry) throw new Error(myError?.message || "Queue entry not found");
    if (myEntry.status !== "waiting") return { game: null as Game | null };

    const entry = myEntry as MatchmakingQueue;

    // Find a waiting opponent with the same variant/time_control and similar rating (within 300)
    const { data: opponents, error: oppError } = await supabase
      .from("matchmaking_queue")
      .select("*")
      .eq("status", "waiting")
      .eq("variant", entry.variant)
      .eq("time_control", entry.time_control)
      .neq("user_id", context.userId)
      .gte("rating", (entry.rating ?? 1200) - 300)
      .lte("rating", (entry.rating ?? 1200) + 300)
      .order("created_at", { ascending: true })
      .limit(1);

    if (oppError) throw new Error(oppError.message);

    if (!opponents || opponents.length === 0) {
      return { game: null as Game | null };
    }

    const opponent = opponents[0] as MatchmakingQueue;

    // Decide colors randomly
    const whiteIsMe = Math.random() < 0.5;
    const whiteId = whiteIsMe ? context.userId : opponent.user_id;
    const blackId = whiteIsMe ? opponent.user_id : context.userId;
    const whiteRating = whiteIsMe ? entry.rating : opponent.rating;
    const blackRating = whiteIsMe ? opponent.rating : entry.rating;
    const initialMs = timeControlToMs(entry.time_control);

    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({
        white_id: whiteId,
        black_id: blackId,
        white_rating: whiteRating,
        black_rating: blackRating,
        variant: entry.variant,
        time_control: entry.time_control,
        status: "active",
        initial_fen:
          entry.variant === "chess960"
            ? undefined
            : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        current_fen:
          entry.variant === "chess960"
            ? undefined
            : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        white_time_ms: initialMs,
        black_time_ms: initialMs,
      })
      .select()
      .single();

    if (gameError || !game) throw new Error(gameError?.message || "Failed to create game");

    // Mark both queue entries as matched
    await supabase
      .from("matchmaking_queue")
      .update({ status: "matched" })
      .in("id", [entry.id, opponent.id]);

    // Notify opponent
    await supabase.from("notifications").insert({
      user_id: opponent.user_id,
      type: "match_found",
      title: "Match found",
      body: `Your ${entry.time_control} ${entry.variant} game is ready.`,
      data: { game_id: game.id },
    });

    return { game: game as Game };
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
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("*")
      .eq("id", data.gameId)
      .single();

    if (gameError || !game) throw new Error(gameError?.message || "Game not found");

    const isWhite = game.white_id === context.userId;
    const fen = data.fen;
    const isWhiteToMove = fen.split(" ")[1] === "w";

    // Validate turn
    if (game.status !== "active") throw new Error("Game is not active");
    if ((isWhite && !isWhiteToMove) || (!isWhite && isWhiteToMove)) {
      throw new Error("Not your turn");
    }

    const { count, error: countError } = await supabase
      .from("game_moves")
      .select("*", { count: "exact", head: true })
      .eq("game_id", data.gameId);

    if (countError) throw new Error(countError.message);

    const moveNumber = (count ?? 0) + 1;

    const { error: moveError } = await supabase.from("game_moves").insert({
      game_id: data.gameId,
      move_number: moveNumber,
      san: data.san,
      uci: data.uci,
      fen: data.fen,
      white_time_ms: data.whiteTimeMs,
      black_time_ms: data.blackTimeMs,
    });

    if (moveError) throw new Error(moveError.message);

    const { error: updateError } = await supabase
      .from("games")
      .update({
        current_fen: data.fen,
        white_time_ms: data.whiteTimeMs,
        black_time_ms: data.blackTimeMs,
        last_move_at: new Date().toISOString(),
      })
      .eq("id", data.gameId);

    if (updateError) throw new Error(updateError.message);

    // Notify opponent
    const opponentId = isWhite ? game.black_id : game.white_id;
    await supabase.from("notifications").insert({
      user_id: opponentId,
      type: "move",
      title: "Your move",
      body: `Your opponent played ${data.san}.`,
      data: { game_id: data.gameId },
    });

    return { ok: true, moveNumber };
  });

export const finishGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        gameId: z.string().uuid(),
        result: z.enum(["1-0", "0-1", "1/2-1/2", "*"]),
        winnerId: z.string().uuid().nullable(),
        endReason: z.string().min(1),
        finalFen: z.string().min(10),
      })
      .parse(input),
  )
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

    // Update ratings and stats
    const whiteWon = data.result === "1-0";
    const blackWon = data.result === "0-1";
    const draw = data.result === "1/2-1/2";

    await supabase.rpc("update_ratings_after_game", {
      _game_id: data.gameId,
    });

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
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", data.id)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
