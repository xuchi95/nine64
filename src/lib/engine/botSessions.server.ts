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
import { rulesFor } from "@/lib/chess/rules";
import type { RulesPosition } from "@/lib/chess/rules";
import { engineUciToAppMove } from "@/lib/chess/rules";
import type { VariantId } from "@/config/variants";
import { TITAN_SLUG, type EngineConfig } from "./profileTypes";

export type SessionVariant = "standard" | "chess960";

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
  variant: SessionVariant;
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
  | "QUOTA_EXCEEDED"
  | "WRITE_FAILED";

export type SessionResult =
  | { ok: true; snapshot: SessionSnapshot; replayed?: boolean }
  | { ok: false; code: SessionError; message?: string; snapshot?: SessionSnapshot };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Atomic daily Titan quota (UTC bucket). Counts canonical engine searches
 * only, charges once per (session, idempotency key) so retries never
 * double-charge, and is checked BEFORE any Cloud Run CPU is spent. The client
 * never supplies a counter, and a new session cannot reset the bucket because
 * it is keyed on the user, not the session.
 */
async function consumeDailyQuota(args: {
  userId: string;
  sessionId: string;
  idempotencyKey: string;
  limit: number;
}): Promise<{ ok: boolean; code?: "QUOTA_EXCEEDED" | "WRITE_FAILED" }> {
  const db = await admin();
  const { data, error } = await db.rpc("titan_consume_move", {
    _user_id: args.userId,
    _session_id: args.sessionId,
    _idempotency_key: args.idempotencyKey,
    _limit: args.limit,
  } as never);
  if (error) return { ok: false, code: "WRITE_FAILED" };
  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload["ok"] === true) return { ok: true };
  return { ok: false, code: payload["code"] === "QUOTA_EXCEEDED" ? "QUOTA_EXCEEDED" : "WRITE_FAILED" };
}

/** Estimated compute usage only — this is measured engine time, not GCP billing. */
async function recordEngineMs(userId: string, ms: number | null): Promise<void> {
  if (!ms || ms <= 0) return;
  const db = await admin();
  await db.rpc("titan_record_engine_ms", { _user_id: userId, _ms: Math.trunc(ms) } as never);
}

function toSnapshot(row: Record<string, unknown>): SessionSnapshot {
  const meta = (row["engine_meta"] ?? {}) as Record<string, unknown>;
  return {
    sessionId: String(row["id"]),
    profileSlug: String(row["profile_slug"]),
    level: Number(row["level"]),
    playerColor: row["player_color"] === "b" ? "b" : "w",
    variant: row["variant"] === "chess960" ? "chess960" : "standard",
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

function outcome(chess: RulesPosition): { status: "active" | "finished"; result: string | null; endReason: string | null } {
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

/**
 * Stockfish boundary decode. Standard UCI passes through; Chess960 castling
 * arrives as "king takes rook" and is mapped to the Nine64 app convention
 * (king -> final king square).
 */
function decodeEngineMove(
  variant: SessionVariant,
  fen: string,
  uci: string,
): { from: string; to: string; promotion?: string } | null {
  if (variant !== "chess960") {
    return {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci[4] as string } : {}),
    };
  }
  return engineUciToAppMove(fen, uci);
}

export async function createSession(args: {
  userId: string;
  playerColor: "w" | "b";
  variant: SessionVariant;
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

  // The 960 array is drawn once, here, and stored as the canonical start.
  const startFen = rulesFor(args.variant as VariantId).startingFen();
  const { data, error } = await db
    .from("bot_sessions")
    .insert({
      user_id: args.userId,
      profile_slug: TITAN_SLUG,
      level: args.level,
      player_color: args.playerColor,
      variant: args.variant,
      initial_fen: startFen,
      current_fen: startFen,
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

  const chess = rulesFor(session.variant as VariantId).createPosition(session.fen);
  if (chess.turn() !== session.playerColor) {
    return { ok: false, code: "NOT_YOUR_TURN", snapshot: session };
  }
  const from = args.uci.slice(0, 2);
  const to = args.uci.slice(2, 4);
  const promotion = args.uci.length > 4 ? args.uci[4] : undefined;
  const playerMove = chess.move(from, to, promotion);
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
    const quota = await consumeDailyQuota({
      userId: args.userId,
      sessionId: args.sessionId,
      idempotencyKey: args.idempotencyKey,
      limit: args.config.perUserDailyMoves,
    });
    if (!quota.ok) return { ok: false, code: quota.code ?? "WRITE_FAILED", snapshot: session };
    const searchFen = chess.fen();
    const reply = await requestBestMove({
      fen: searchFen,
      variant: session.variant,
      config: args.config,
      clock: args.clock,
      sessionId: args.sessionId,
      requestId: args.idempotencyKey,
      newGame: moves.length <= 1,
    });
    if (reply.status !== "ok" || !reply.bestmove) {
      return {
        ok: false,
        code: reply.status === "not_configured" ? "ENGINE_NOT_CONFIGURED" : "ENGINE_UNAVAILABLE",
        snapshot: session,
      };
    }
    // The cloud reply is never trusted blindly: decode Chess960 castling out
    // of Stockfish notation, then re-validate against canonical rules.
    const app = decodeEngineMove(session.variant, searchFen, reply.bestmove);
    if (!app) {
      console.error("[titan] CHESS960_MOVE_DECODE_FAILED", {
        sessionId: args.sessionId,
        variant: session.variant,
      });
      return { ok: false, code: "ENGINE_UNAVAILABLE", snapshot: session };
    }
    const engineMove = chess.move(app.from, app.to, app.promotion);
    if (!engineMove) {
      console.error("[titan] CHESS960_ENGINE_ILLEGAL_MOVE", {
        sessionId: args.sessionId,
        variant: session.variant,
      });
      return { ok: false, code: "ENGINE_UNAVAILABLE", snapshot: session };
    }
    const appUci = `${app.from}${app.to}${app.promotion ?? ""}`;
    moves.push({ san: engineMove.san, uci: appUci, fen: chess.fen(), by: "engine", ...(reply.timeMs ? { ms: reply.timeMs } : {}) });
    await recordEngineMs(args.userId, reply.timeMs);
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

/**
 * Engine opens the game when the player chose Black. Idempotent: a session
 * that already has moves is returned unchanged, so a refresh never produces a
 * second engine move.
 */
export async function engineOpeningMove(args: {
  sessionId: string;
  userId: string;
  config: EngineConfig;
  clock: { whiteMs: number; blackMs: number; whiteIncMs: number; blackIncMs: number } | null;
}): Promise<SessionResult> {
  const current = await getSession(args.sessionId, args.userId);
  if (!current.ok) return current;
  const session = current.snapshot;
  if (session.status !== "active") return { ok: false, code: "SESSION_CLOSED", snapshot: session };
  if (session.playerColor !== "b" || session.moves.length > 0) return { ok: true, snapshot: session };

  const { requestBestMove, cloudEngineConfigured } = await import("./cloudEngine.server");
  if (!cloudEngineConfigured()) return { ok: false, code: "ENGINE_NOT_CONFIGURED", snapshot: session };

  const quota = await consumeDailyQuota({
    userId: args.userId,
    sessionId: args.sessionId,
    idempotencyKey: `${args.sessionId}:open`,
    limit: args.config.perUserDailyMoves,
  });
  if (!quota.ok) return { ok: false, code: quota.code ?? "WRITE_FAILED", snapshot: session };

  const chess = rulesFor(session.variant as VariantId).createPosition(session.fen);
  const reply = await requestBestMove({
    fen: session.fen,
    variant: session.variant,
    config: args.config,
    clock: args.clock,
    sessionId: args.sessionId,
    requestId: `${args.sessionId}:open`,
    newGame: true,
  });
  if (reply.status !== "ok" || !reply.bestmove) {
    return {
      ok: false,
      code: reply.status === "not_configured" ? "ENGINE_NOT_CONFIGURED" : "ENGINE_UNAVAILABLE",
      snapshot: session,
    };
  }
  const app = decodeEngineMove(session.variant, session.fen, reply.bestmove);
  const engineMove = app ? chess.move(app.from, app.to, app.promotion) : null;
  if (!app || !engineMove) return { ok: false, code: "ENGINE_UNAVAILABLE", snapshot: session };

  const moves: SessionMove[] = [
    { san: engineMove.san, uci: `${app.from}${app.to}${app.promotion ?? ""}`, fen: chess.fen(), by: "engine", ...(reply.timeMs ? { ms: reply.timeMs } : {}) },
  ];
  await recordEngineMs(args.userId, reply.timeMs);
  const engineMeta = {
    name: "Nine64 Titan",
    depth: reply.depth,
    nodes: reply.nodes,
    nps: reply.nps,
    timeMs: reply.timeMs,
    engineVersion: reply.engineVersion,
  };
  const committed = await commit({
    sessionId: args.sessionId,
    userId: args.userId,
    expectedVersion: session.version,
    idempotencyKey: `${args.sessionId}:open`,
    fen: chess.fen(),
    moves,
    status: "active",
    result: null,
    endReason: null,
    engineMeta,
  });
  if (!committed.ok) {
    const fresh = await getSession(args.sessionId, args.userId);
    return fresh.ok
      ? { ok: true, snapshot: fresh.snapshot }
      : { ok: false, code: (committed.code as SessionError) ?? "WRITE_FAILED" };
  }
  return {
    ok: true,
    snapshot: {
      ...session,
      fen: chess.fen(),
      moves,
      version: committed.version ?? session.version + 1,
      engine: {
        name: "Nine64 Titan",
        depth: reply.depth,
        nodes: reply.nodes,
        nps: reply.nps,
        timeMs: reply.timeMs,
        engineVersion: reply.engineVersion,
      },
    },
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
  if (s.status !== "active") return { ok: true, snapshot: s };
  const db = await admin();
  const result = reason === "resign" ? (s.playerColor === "w" ? "0-1" : "1-0") : null;
  const { data: updated } = await db
    .from("bot_sessions")
    .update({
      status: reason === "resign" ? "finished" : "aborted",
      result,
      end_reason: reason,
      finished_at: new Date().toISOString(),
      version: s.version + 1,
    } as never)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("status", "active")
    .select("*")
    .maybeSingle();
  // Concurrent close: whoever lost the race still gets the canonical row.
  if (!updated) {
    const fresh = await getSession(sessionId, userId);
    if (fresh.ok) return fresh;
  }
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
