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
  baseFen: z.string().min(10),
  whiteTimeMs: z.number().int().min(0),
  blackTimeMs: z.number().int().min(0),
});

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

const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function shuffleStrings(arr: string[]): string[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function generateChess960Fen(): string {
  const lightSquares = [1, 3, 5, 7];
  const darkSquares = [0, 2, 4, 6];
  const b1 = lightSquares[Math.floor(Math.random() * lightSquares.length)]!;
  const b2 = darkSquares[Math.floor(Math.random() * darkSquares.length)]!;

  const remaining = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => i !== b1 && i !== b2);
  let pieces: string[];
  do {
    pieces = shuffleStrings(
      remaining.map((i) => {
        if (i === 0 || i === 7) return "r";
        if (i === 1 || i === 6) return "n";
        if (i === 2 || i === 5) return "b";
        if (i === 3) return "q";
        return "k";
      }),
    );
  } while (!isValid960BackRank(pieces));

  const rank = new Array(8).fill("");
  rank[b1] = "b";
  rank[b2] = "b";
  let idx = 0;
  for (let i = 0; i < 8; i++) {
    if (!rank[i]) rank[i] = pieces[idx++];
  }
  return `${rank.join("")}/pppppppp/8/8/8/8/PPPPPPPP/${rank.join("").toUpperCase()} w KQkq - 0 1`;
}

function isValid960BackRank(pieces: string[]): boolean {
  const kingIndex = pieces.indexOf("k");
  const rookLeft = pieces.indexOf("r");
  const rookRight = pieces.lastIndexOf("r");
  return kingIndex > rookLeft && kingIndex < rookRight;
}

function startingFenForVariant(variant: string): string {
  return variant === "chess960" ? generateChess960Fen() : STANDARD_FEN;
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
    // Matchmaking must bypass RLS so it can see other users' queue rows.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: myEntry, error: myError } = await supabaseAdmin
      .from("matchmaking_queue")
      .select("*")
      .eq("id", data.queueId)
      .eq("user_id", context.userId)
      .single();

    if (myError || !myEntry) throw new Error(myError?.message || "Queue entry not found");
    if (myEntry.status !== "waiting") return { game: null as Game | null };

    const entry = myEntry as MatchmakingQueue;

    // Priority matchmaking: closest rating + similar uncertainty, window widens
    // with wait time, and rematches with the last two opponents are avoided.
    const rpc = supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;

    const { data: matchId, error: matchError } = await rpc("find_match", {
      _queue_id: entry.id,
    });

    if (matchError) throw new Error(matchError.message);
    if (!matchId || typeof matchId !== "string") {
      return { game: null as Game | null };
    }

    const { data: opponentRow, error: oppError } = await supabaseAdmin
      .from("matchmaking_queue")
      .select("*")
      .eq("id", matchId)
      .eq("status", "waiting")
      .maybeSingle();

    if (oppError) throw new Error(oppError.message);
    if (!opponentRow) return { game: null as Game | null };

    const opponent = opponentRow as MatchmakingQueue;


    // Decide colors randomly
    const whiteIsMe = Math.random() < 0.5;
    const whiteId = whiteIsMe ? context.userId : opponent.user_id;
    const blackId = whiteIsMe ? opponent.user_id : context.userId;
    const whiteRating = whiteIsMe ? entry.rating : opponent.rating;
    const blackRating = whiteIsMe ? opponent.rating : entry.rating;
    const initialMs = timeControlToMs(entry.time_control);

    const startFen = startingFenForVariant(entry.variant);
    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .insert({
        white_id: whiteId,
        black_id: blackId,
        white_rating: whiteRating,
        black_rating: blackRating,
        variant: entry.variant,
        time_control: entry.time_control,
        status: "active",
        initial_fen: startFen,
        current_fen: startFen,
        white_time_ms: initialMs,
        black_time_ms: initialMs,
      })
      .select()
      .single();

    if (gameError || !game) throw new Error(gameError?.message || "Failed to create game");

    // Mark both queue entries as matched
    await supabaseAdmin
      .from("matchmaking_queue")
      .update({ status: "matched" })
      .in("id", [entry.id, opponent.id]);

    // Notify both players
    await supabaseAdmin.from("notifications").insert([
      {
        user_id: opponent.user_id,
        type: "match_found",
        title: "Match found",
        body: `Your ${entry.time_control} ${entry.variant} game is ready.`,
        data: { game_id: game.id },
      },
      {
        user_id: context.userId,
        type: "match_found",
        title: "Match found",
        body: `Your ${entry.time_control} ${entry.variant} game is ready.`,
        data: { game_id: game.id },
      },
    ]);

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

    // Glicko-2 rating update (rating, deviation and volatility) — service role only.
    const draw = data.result === "1/2-1/2";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminRpc = supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
    const { error: ratingError } = await adminRpc("apply_glicko2", { _game_id: data.gameId });
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
