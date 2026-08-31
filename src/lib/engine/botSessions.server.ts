/**
 * Server-authoritative bot sessions (human vs Nine64 Titan).
 *
 * Anti-cheat contract — the engine can ONLY be reached through a bot session
 * that the caller owns. There is deliberately no "post any FEN, get the best
 * move" endpoint: such an endpoint would be a ready-made cheating tool for
 * human-vs-human games.
 *
 * Every request is rejected unless:
 *  - the session exists and belongs to the caller,
 *  - the session is still active,
 *  - the submitted `expectedVersion` matches the canonical version,
 *  - the submitted move is legal from the canonical FEN (chess.js),
 *  - it is actually the player's turn.
 *
 * Server-only module.
 */
import { Chess } from "chess.js";
import { TITAN_SLUG, type EngineConfig } from "./profileTypes";

export interface SessionMove {
  san: string;
  uci: string;
  fen: string;
  by: "player" | "engine";
  ms?: number;
}

export interface SessionSnapshot {
  sessionId: string;
  profileSlug: string;
  level: number;
  playerColor: "w" | "b";
  status: "active" | "finished" | "aborted" | "expired";
  result: string | null;
  endReason: string | null;
  fen: string;
  moves: SessionMove[];
  version: number;
  engine: {
    name: string;
    depth: number | null;
    nodes: number | null;
    nps: number | null;
    timeMs: number | null;
    engineVersion: string | null;
  } | null;
}

export type SessionError =
  | "PROFILE_DISABLED"
  | "ENGINE_NOT_CONFIGURED"
  | "ENGINE_UNAVAILABLE"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "SESSION_CLOSED"
  | "VERSION_CONFLICT"
  | "ILLEGAL_MOVE"
  | "NOT_YOUR_TURN"
  | "TOO_MANY_SESSIONS"
  | "WRITE_FAILED";

export type SessionResult =
  | { ok: true; snapshot: SessionSnapshot; replayed?: boolean }
  | { ok: false; code: SessionError; message?: string; snapshot?: SessionSnapshot };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function toSnapshot(row: Record<string, unknown>): SessionSnapshot {
  const meta = (row["engine_meta"] ?? {}) as Record<string, unknown>;
  return {
    sessionId: String(row["id"]),
    profileSlug: String(row["profile_slug"]),
    level: Number(row["level"]),
    playerColor: row["player_color"] === "b" ? "b" : "w",
    status: (row["status"] as SessionSnapshot["status"]) ?? "active",
    result: (row["result"] as string | null) ?? null,
    endReason: (row["end_reason"] as string | null) ?? null,
    fen: String(row["current_fen"]),
    moves: Array.isArray(row["moves"]) ? (row["moves"] as SessionMove[]) : [],
    version: Number(row["version"] ?? 0),
    engine: Object.keys(meta).length
      ? {
          name: String(meta["name"] ?? "Nine64 Titan"),
          depth: (meta["depth"] as number | null) ?? null,
          nodes: (meta["nodes"] as number | null) ?? null,
          nps: (meta["nps"] as number | null) ?? null,
          timeMs: (meta["timeMs"] as number | null) ?? null,
          engineVersion: (meta["engineVersion"] as string | null) ?? null,
        }
      : null,
  };
}

function outcome(chess: Chess): { status: "active" | "finished"; result: string | null; endReason: string | null } {
  if (!chess.isGameOver()) return { status: "active", result: null, endReason: null };
  if (chess.isCheckmate()) {
    return {
      status: "finished",
      result: chess.turn() === "w" ? "0-1" : "1-0",
      endReason: "checkmate",
    };
  }
  if (chess.isStalemate()) return { status: "finished", result: "1/2-1/2", endReason: "stalemate" };
  if (chess.isInsufficientMaterial())
    return { status: "finished", result: "1/2-1/2", endReason: "insufficient_material" };
  if (chess.isThreefoldRepetition())
    return { status: "finished", result: "1/2-1/2", endReason: "threefold_repetition" };
  return { status: "finished", result: "1/2-1/2", endReason: "fifty_move_rule" };
}

export async function createSession(args: {
  userId: string;
  playerColor: "w" | "b";
  config: EngineConfig;
  level: number;
}): Promise<SessionResult> {
  const db = await admin();
  const { count } = await db
    .from("bot_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .eq("status", "active");
  if ((count ?? 0) >= args.config.maxConcurrentGames) {
    return { ok: false, code: "TOO_MANY_SESSIONS" };
  }

  const chess = new Chess();
  const { data, error } = await db
    .from("bot_sessions")
    .insert({
      user_id: args.userId,
      profile_slug: TITAN_SLUG,
      level: args.level,
      player_color: args.playerColor,
      initial_fen: chess.fen(),
      current_fen: chess.fen(),
      moves: [],
    } as never)
    .select("*")
    .single();
  if (error || !data) return { ok: false, code: "WRITE_FAILED", message: error?.message };
  return { ok: true, snapshot: toSnapshot(data as Record<string, unknown>) };
}

export async function getSession(sessionId: string, userId: string): Promise<SessionResult> {
  const db = await admin();
  const { data } = await db.from("bot_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!data) return { ok: false, code: "NOT_FOUND" };
  if ((data as { user_id: string }).user_id !== userId) return { ok: false, code: "FORBIDDEN" };
  return { ok: true, snapshot: toSnapshot(data as Record<string, unknown>) };
}

async function commit(args: {
  sessionId: string;
  userId: string;
  expectedVersion: number;
  idempotencyKey: string;
  fen: string;
  moves: SessionMove[];
  status: string;
  result: string | null;
  endReason: string | null;
  engineMeta: Record<string, unknown>;
}): Promise<{ ok: boolean; code?: string; version?: number; replayed?: boolean }> {
  const db = await admin();
  const { data, error } = await db.rpc("bot_session_commit", {
    _session_id: args.sessionId,
    _user_id: args.userId,
    _expected_version: args.expectedVersion,
    _idempotency_key: args.idempotencyKey,
    _current_fen: args.fen,
    _moves: args.moves as unknown as Record<string, unknown>,
    _status: args.status,
    _result: args.result,
    _end_reason: args.endReason,
    _engine_meta: args.engineMeta,
  } as never);
  if (error) return { ok: false, code: "WRITE_FAILED" };
  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    ok: Boolean(payload["ok"]),
    ...(payload["code"] ? { code: String(payload["code"]) } : {}),
    version: Number(payload["version"] ?? args.expectedVersion),
    replayed: Boolean(payload["replayed"]),
  };
}

/**
 * Applies the player's move, asks the cloud engine for its reply and commits
 * both in one canonical version bump. Replays of the same idempotency key
 * return the stored snapshot instead of playing a second engine move.
 */
export async function playMove(args: {
  sessionId: string;
  userId: string;
  expectedVersion: number;
  uci: string;
  idempotencyKey: string;
  config: EngineConfig;
  clock: { whiteMs: number; blackMs: number; whiteIncMs: number; blackIncMs: number } | null;
}): Promise<SessionResult> {
  const current = await getSession(args.sessionId, args.userId);
  if (!current.ok) return current;
  const session = current.snapshot;

  if (session.status !== "active") return { ok: false, code: "SESSION_CLOSED", snapshot: session };

  const db = await admin();
  const { data: stored } = await db
    .from("bot_sessions")
    .select("last_idempotency_key, last_snapshot")
    .eq("id", args.sessionId)
    .maybeSingle();
  if (stored && (stored as { last_idempotency_key: string | null }).last_idempotency_key === args.idempotencyKey) {
    return { ok: true, snapshot: session, replayed: true };
  }
  if (session.version !== args.expectedVersion) {
    return { ok: false, code: "VERSION_CONFLICT", snapshot: session };
  }

  const chess = new Chess(session.fen);
  if (chess.turn() !== session.playerColor) {
    return { ok: false, code: "NOT_YOUR_TURN", snapshot: session };
  }
  const from = args.uci.slice(0, 2);
  const to = args.uci.slice(2, 4);
  const promotion = args.uci.length > 4 ? args.uci[4] : undefined;
  let playerMove;
  try {
    playerMove = chess.move({ from, to, ...(promotion ? { promotion } : {}) });
  } catch {
    playerMove = null;
  }
  if (!playerMove) return { ok: false, code: "ILLEGAL_MOVE", snapshot: session };

  const moves: SessionMove[] = [
    ...session.moves,
    { san: playerMove.san, uci: args.uci, fen: chess.fen(), by: "player" },
  ];

  let after = outcome(chess);
  let engineMeta: Record<string, unknown> = {};

  if (after.status === "active") {
    const { requestBestMove, cloudEngineConfigured } = await import("./cloudEngine.server");
    if (!cloudEngineConfigured()) {
      return { ok: false, code: "ENGINE_NOT_CONFIGURED", snapshot: session };
    }
    const reply = await requestBestMove({
      fen: session.fen,
      moves: [...session.moves.map((m) => m.uci), args.uci],
      config: args.config,
      clock: args.clock,
      sessionId: args.sessionId,
      requestId: args.idempotencyKey,
    });
    if (reply.status !== "ok" || !reply.bestmove) {
      return {
        ok: false,
        code: reply.status === "not_configured" ? "ENGINE_NOT_CONFIGURED" : "ENGINE_UNAVAILABLE",
        snapshot: session,
      };
    }
    // The cloud reply is never trusted blindly: it must be legal here too.
    let engineMove;
    try {
      engineMove = chess.move({
        from: reply.bestmove.slice(0, 2),
        to: reply.bestmove.slice(2, 4),
        ...(reply.bestmove.length > 4 ? { promotion: reply.bestmove[4] } : {}),
      });
    } catch {
      engineMove = null;
    }
    if (!engineMove) {
      console.error("[titan] engine returned an illegal move", { sessionId: args.sessionId });
      return { ok: false, code: "ENGINE_UNAVAILABLE", snapshot: session };
    }
    moves.push({ san: engineMove.san, uci: reply.bestmove, fen: chess.fen(), by: "engine", ...(reply.timeMs ? { ms: reply.timeMs } : {}) });
    after = outcome(chess);
    engineMeta = {
      name: "Nine64 Titan",
      depth: reply.depth,
      nodes: reply.nodes,
      nps: reply.nps,
      timeMs: reply.timeMs,
      engineVersion: reply.engineVersion,
    };
  }

  const committed = await commit({
    sessionId: args.sessionId,
    userId: args.userId,
    expectedVersion: args.expectedVersion,
    idempotencyKey: args.idempotencyKey,
    fen: chess.fen(),
    moves,
    status: after.status,
    result: after.result,
    endReason: after.endReason,
    engineMeta,
  });
  if (!committed.ok) {
    const fresh = await getSession(args.sessionId, args.userId);
    return {
      ok: false,
      code: (committed.code as SessionError) ?? "WRITE_FAILED",
      ...(fresh.ok ? { snapshot: fresh.snapshot } : {}),
    };
  }

  return {
    ok: true,
    snapshot: {
      ...session,
      fen: chess.fen(),
      moves,
      status: after.status,
      result: after.result,
      endReason: after.endReason,
      version: committed.version ?? session.version + 1,
      engine: Object.keys(engineMeta).length
        ? {
            name: "Nine64 Titan",
            depth: (engineMeta["depth"] as number | null) ?? null,
            nodes: (engineMeta["nodes"] as number | null) ?? null,
            nps: (engineMeta["nps"] as number | null) ?? null,
            timeMs: (engineMeta["timeMs"] as number | null) ?? null,
            engineVersion: (engineMeta["engineVersion"] as string | null) ?? null,
          }
        : null,
    },
    ...(committed.replayed ? { replayed: true } : {}),
  };
}

export async function endSession(
  sessionId: string,
  userId: string,
  reason: "resign" | "abort",
): Promise<SessionResult> {
  const current = await getSession(sessionId, userId);
  if (!current.ok) return current;
  const s = current.snapshot;
  const db = await admin();
  const result = reason === "resign" ? (s.playerColor === "w" ? "0-1" : "1-0") : null;
  await db
    .from("bot_sessions")
    .update({
      status: reason === "resign" ? "finished" : "aborted",
      result,
      end_reason: reason,
      finished_at: new Date().toISOString(),
      version: s.version + 1,
    } as never)
    .eq("id", sessionId)
    .eq("user_id", userId);
  return {
    ok: true,
    snapshot: {
      ...s,
      status: reason === "resign" ? "finished" : "aborted",
      result,
      endReason: reason,
      version: s.version + 1,
    },
  };
}

/** Cron/admin cleanup for abandoned sessions. */
export async function expireIdleSessions(idleMinutes = 240): Promise<number> {
  const db = await admin();
  const { data } = await db.rpc("expire_bot_sessions", { _idle_minutes: idleMinutes } as never);
  return Number(data ?? 0);
}

export async function listActiveSessions(limit = 100): Promise<
  { id: string; userId: string; level: number; version: number; status: string; updatedAt: string; plies: number }[]
> {
  const db = await admin();
  const { data } = await db
    .from("bot_sessions")
    .select("id, user_id, level, version, status, updated_at, moves")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row["id"]),
      userId: String(row["user_id"]),
      level: Number(row["level"]),
      version: Number(row["version"]),
      status: String(row["status"]),
      updatedAt: String(row["updated_at"]),
      plies: Array.isArray(row["moves"]) ? (row["moves"] as unknown[]).length : 0,
    };
  });
}
