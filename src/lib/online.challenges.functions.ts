import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Game } from "@/lib/database.types";
import {
  CHALLENGE_CREATE_SCHEMA,
  CHALLENGE_RESPOND_SCHEMA,
  GAME_ID_SCHEMA,
  TAKEBACK_REQUEST_SCHEMA,
  TAKEBACK_RESPOND_SCHEMA,
  startingFenForVariant,
} from "@/lib/online.helpers";

/**
 * Challenges, takebacks, presence and spectating.
 *
 * Every mutation goes through a `SECURITY DEFINER` RPC that re-derives the
 * caller's rights from the row itself — the client only names an intent and an
 * id. Nothing here trusts a colour, a clock, a rating or a result sent by the
 * browser.
 */

export type Challenge = {
  id: string;
  creator_id: string;
  opponent_id: string | null;
  variant: string;
  time_control: string;
  pace: "realtime" | "daily";
  rated: boolean;
  color: "white" | "black" | "random";
  allow_takeback: boolean;
  spectate: "public" | "private";
  spectator_delay_seconds: number;
  rematch_of: string | null;
  message: string | null;
  status: "open" | "accepted" | "declined" | "cancelled" | "expired";
  game_id: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type TakebackRequest = {
  id: string;
  game_id: string;
  requested_by: string;
  requested_to: string;
  plies: number;
  game_version: number;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  created_at: string;
  expires_at: string;
  responded_at: string | null;
};

type RpcEnvelope<T> = { ok: boolean; code: string } & T;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function kickOutbox() {
  try {
    const client = await admin();
    await client.rpc("process_notification_outbox", { _limit: 50 });
  } catch (err) {
    console.error("Notification outbox kick failed", err);
  }
}

/** Open lobby challenges plus everything addressed to or created by the caller. */
export const listChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("game_challenges")
      .select("*")
      .in("status", ["open", "accepted"])
      .gte("expires_at", new Date(Date.now() - 60_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(60);

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Challenge[];
    return {
      incoming: rows.filter((c) => c.status === "open" && c.opponent_id === context.userId),
      outgoing: rows.filter((c) => c.status === "open" && c.creator_id === context.userId),
      open: rows.filter(
        (c) => c.status === "open" && c.opponent_id === null && c.creator_id !== context.userId,
      ),
      accepted: rows.filter(
        (c) =>
          c.status === "accepted" &&
          (c.creator_id === context.userId || c.opponent_id === context.userId),
      ),
    };
  });

export const createChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CHALLENGE_CREATE_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit, userSubject } = await import("@/lib/ratelimit/limiter.server");
    await enforceRateLimit("matchmaking.join", userSubject(context.userId));

    const client = await admin();
    const { data: raw, error } = await client.rpc("challenge_create", {
      _user_id: context.userId,
      _opponent_id: data.opponentId ?? null,
      _variant: data.variant,
      _time_control: data.timeControl,
      _rated: data.rated,
      _color: data.color,
      _allow_takeback: data.allowTakeback ?? false,
      _spectate: data.spectate ?? "public",
      _spectator_delay: data.spectatorDelaySeconds ?? 0,
      _rematch_of: data.rematchOf ?? null,
      _message: data.message ?? null,
    });
    if (error) throw new Error(error.message);

    const payload = (raw ?? {}) as RpcEnvelope<{ challenge?: Challenge }>;
    if (payload.ok) await kickOutbox();
    return { ok: payload.ok, code: payload.code, challenge: payload.challenge ?? null };
  });

/** Accept / decline / cancel. Accepting is where the game row is born. */
export const respondChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CHALLENGE_RESPOND_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    const client = await admin();

    // The starting position is generated server-side (Scharnagl for 960) and
    // only used when the challenge is actually accepted.
    let initialFen = "";
    if (data.action === "accept") {
      const { data: row, error: readError } = await client
        .from("game_challenges")
        .select("variant")
        .eq("id", data.challengeId)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      if (!row) return { ok: false, code: "CHALLENGE_NOT_FOUND", challenge: null, game: null };
      initialFen = startingFenForVariant(row.variant);
    }

    const { data: raw, error } = await client.rpc("challenge_respond", {
      _challenge_id: data.challengeId,
      _user_id: context.userId,
      _action: data.action,
      _initial_fen: initialFen,
    });
    if (error) throw new Error(error.message);

    const payload = (raw ?? {}) as RpcEnvelope<{ challenge?: Challenge; game?: Game }>;
    if (payload.ok) await kickOutbox();
    return {
      ok: payload.ok,
      code: payload.code,
      challenge: payload.challenge ?? null,
      game: payload.game ?? null,
    };
  });

/** Pending takeback for a game, visible to both players. */
export const getTakebackState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GAME_ID_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("game_takeback_requests")
      .select("*")
      .eq("game_id", data.gameId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) throw new Error(error.message);
    const requests = (rows ?? []) as unknown as TakebackRequest[];
    const pending =
      requests.find((r) => r.status === "pending" && Date.parse(r.expires_at) > Date.now()) ?? null;
    return { pending, latest: requests[0] ?? null };
  });

export const requestTakeback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TAKEBACK_REQUEST_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    const client = await admin();
    const { data: raw, error } = await client.rpc("takeback_request_internal", {
      _game_id: data.gameId,
      _user_id: context.userId,
      _expected_version: data.expectedVersion,
      _idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(error.message);

    const payload = (raw ?? {}) as RpcEnvelope<{ request?: TakebackRequest; game?: Game }>;
    if (payload.ok) await kickOutbox();
    return {
      ok: payload.ok,
      code: payload.code,
      request: payload.request ?? null,
      game: payload.game ?? null,
    };
  });

export const respondTakeback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TAKEBACK_RESPOND_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    const client = await admin();
    const { data: raw, error } = await client.rpc("takeback_respond_internal", {
      _game_id: data.gameId,
      _request_id: data.requestId,
      _user_id: context.userId,
      _action: data.action,
    });
    if (error) throw new Error(error.message);

    const payload = (raw ?? {}) as RpcEnvelope<{ request?: TakebackRequest; game?: Game }>;
    return {
      ok: payload.ok,
      code: payload.code,
      request: payload.request ?? null,
      game: payload.game ?? null,
    };
  });

/**
 * Heartbeat while a player has the board open. Used to show "đối thủ mất kết
 * nối" and to let a reconnecting player resume without any client authority.
 */
export const touchPresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GAME_ID_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    const client = await admin();
    const { data: raw, error } = await client.rpc("game_touch_presence", {
      _game_id: data.gameId,
      _user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return (raw ?? { ok: false, code: "GAME_NOT_FOUND" }) as RpcEnvelope<{
      server_now?: string;
      opponent_seen_at?: string | null;
    }>;
  });

export type SpectatorMove = {
  move_number: number;
  san: string;
  uci: string;
  fen: string;
  white_time_ms: number;
  black_time_ms: number;
  created_at: string;
};

export type SpectatorView = {
  allowed: boolean;
  code: string;
  is_participant?: boolean;
  delayed?: boolean;
  delay_seconds?: number;
  server_now?: string;
  game?: {
    id: string;
    variant: string;
    time_control: string;
    pace: "realtime" | "daily";
    pool: string;
    rated: boolean;
    status: string;
    result: string;
    end_reason: string | null;
    initial_fen: string;
    current_fen: string;
    white_time_ms: number;
    black_time_ms: number;
    increment_ms: number;
    turn_started_at: string | null;
    clock_state: string;
    created_at: string;
    white_name: string;
    black_name: string;
    white_rating: number | null;
    black_rating: number | null;
  };
  moves?: SpectatorMove[];
};

/** Read-only, broadcast-delayed view of a public game. Never accepts moves. */
export const getSpectatorView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GAME_ID_SCHEMA.parse(input))
  .handler(async ({ data, context }): Promise<SpectatorView> => {
    const client = await admin();
    const { data: raw, error } = await client.rpc("game_spectator_view", {
      _game_id: data.gameId,
      _viewer: context.userId,
    });
    if (error) throw new Error(error.message);
    return (raw ?? { allowed: false, code: "GAME_NOT_FOUND" }) as SpectatorView;
  });

export type PublicGameRow = {
  id: string;
  variant: string;
  time_control: string;
  pace: "realtime" | "daily";
  pool: string;
  rated: boolean;
  white_rating: number | null;
  black_rating: number | null;
  created_at: string;
  spectator_delay_seconds: number;
  white_name: string;
  black_name: string;
  ply_count: number;
};

export const listPublicGames = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ limit: z.number().int().min(1).max(50).optional() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const client = await admin();
    const { data: raw, error } = await client.rpc("list_public_games", { _limit: data.limit ?? 20 });
    if (error) throw new Error(error.message);
    return (raw ?? []) as unknown as PublicGameRow[];
  });
