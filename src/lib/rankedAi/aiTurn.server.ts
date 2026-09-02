/**
 * Ranked-AI turn processor — SERVER ONLY.
 *
 * Plays exactly one AI move for one game, through the SAME canonical pipeline a
 * human uses (`applyIntent` → `commit_move_internal` → `apply_rating_once`), so
 * clocks, versioning, PGN, ratings and realtime behave identically.
 *
 * Exactly-once: `ai_move_jobs` carries a unique `(game_id, expected_version)`
 * key, and the commit itself is version-guarded. A duplicate or replayed job
 * therefore either no-ops (`ALREADY_APPLIED`) or fails the version check.
 */
import type { Game, GameMove } from "@/lib/database.types";
import { applyIntent, sideToMoveFromFen } from "@/lib/online/moveEngine";
import { engineUciToAppMove } from "@/lib/chess/rules/chess960MoveCodec";
import { requestBestMove } from "@/lib/engine/cloudEngine.server";
import { rankedAiConfigForRating } from "./strength.server";
import { sleepAfterSearchMs } from "./thinkTime";
import { AI_ENGINE_FAILURE_REASON, type AiTurnCode, type AiTurnResult } from "./types";

const MAX_ATTEMPTS = 3;

function fail(gameId: string, code: AiTurnCode): AiTurnResult {
  return { code, gameId };
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

interface GameRow {
  id: string;
  white_id: string;
  black_id: string;
  status: string;
  version: number;
  current_fen: string;
  variant: string;
  ai_game: boolean;
  ai_profile_id: string | null;
  white_time_ms: number;
  black_time_ms: number;
  increment_ms: number;
  pace: string;
}

/**
 * Runs the AI move for `gameId` when it is actually the AI's turn.
 * Safe to call at-least-once from any trigger (client nudge, sweeper, or the
 * job queue): everything below is idempotent.
 */
export async function playAiTurn(gameId: string, expectedVersion?: number): Promise<AiTurnResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data, error } = await supabaseAdmin
    .from("games")
    .select(
      "id, white_id, black_id, status, version, current_fen, variant, ai_game, ai_profile_id, white_time_ms, black_time_ms, increment_ms, pace",
    )
    .eq("id", gameId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const game = data as GameRow | null;
  if (!game) return fail(gameId, "GAME_NOT_FOUND");
  if (!game.ai_game || !game.ai_profile_id) return fail(gameId, "NOT_AN_AI_GAME");
  if (game.status !== "active") return fail(gameId, "GAME_NOT_ACTIVE");
  if (typeof expectedVersion === "number" && expectedVersion !== game.version) {
    return fail(gameId, expectedVersion < game.version ? "ALREADY_APPLIED" : "STALE_VERSION");
  }

  const aiIsWhite = game.white_id === game.ai_profile_id;
  const sideToMove = sideToMoveFromFen(game.current_fen);
  if ((sideToMove === "w") !== aiIsWhite) return fail(gameId, "NOT_AI_TURN");

  const variant = game.variant === "chess960" ? "chess960" : "standard";

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("rating")
    .eq("id", game.ai_profile_id)
    .maybeSingle();
  const rating = profile?.rating ?? 1500;

  const pace = game.pace === "daily" ? "daily" : "realtime";
  const config = rankedAiConfigForRating({
    rating,
    pace,
    baseMs: aiIsWhite ? game.white_time_ms : game.black_time_ms,
    incMs: game.increment_ms,
    variant,
  });

  let last: AiTurnCode = "ENGINE_UNAVAILABLE";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const started = Date.now();
    const res = await requestBestMove({
      fen: game.current_fen,
      variant,
      config,
      clock:
        config.timePolicy === "clock"
          ? {
              whiteMs: game.white_time_ms,
              blackMs: game.black_time_ms,
              whiteIncMs: game.increment_ms,
              blackIncMs: game.increment_ms,
            }
          : null,
      sessionId: `ai:${gameId}`,
      requestId: `ai:${gameId}:${game.version}:${attempt}`,
      newGame: game.version === 0,
    });

    if (res.status !== "ok" || !res.bestmove) {
      last =
        res.status === "timeout"
          ? "ENGINE_TIMEOUT"
          : res.error === "busy" || res.error === "pool_busy"
            ? "ENGINE_POOL_BUSY"
            : "ENGINE_UNAVAILABLE";

      await sleep(250 * (attempt + 1));
      continue;
    }

    const decoded =
      variant === "chess960"
        ? engineUciToAppMove(game.current_fen, res.bestmove)
        : {
            from: res.bestmove.slice(0, 2),
            to: res.bestmove.slice(2, 4),
            promotion: res.bestmove.length > 4 ? (res.bestmove[4] as "q" | "r" | "b" | "n") : undefined,
          };

    const canonical = decoded
      ? applyIntent(variant, game.current_fen, decoded.from, decoded.to, decoded.promotion as never)
      : null;
    if (!canonical) {
      last = "ENGINE_ILLEGAL_MOVE";
      continue;
    }

    // Human-like pacing, charged to the AI's own clock.
    await sleep(
      sleepAfterSearchMs({
        gameId,
        ply: game.version,
        rating,
        remainingMs: aiIsWhite ? game.white_time_ms : game.black_time_ms,
        searchMs: Date.now() - started,
        pace,
      }),
    );

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

    const { data: raw, error: rpcError } = await supabaseAdmin.rpc("commit_move_internal", {
      _game_id: gameId,
      _user_id: game.ai_profile_id,
      _expected_version: game.version,
      _san: canonical.san,
      _uci: canonical.uci,
      _fen: canonical.fen,
      _outcome: outcome,
      _end_reason: endReason as unknown as string,
    });
    if (rpcError) throw new Error(rpcError.message);

    const payload = (raw ?? {}) as { ok?: boolean; code?: string; game?: Game; move?: GameMove };
    if (!payload.ok || !payload.game) {
      return fail(gameId, payload.code === "STALE_GAME_VERSION" ? "ALREADY_APPLIED" : "COMMIT_FAILED");
    }

    if (payload.game.status === "completed") {
      await supabaseAdmin.rpc("apply_rating_once", { _game_id: gameId });
    } else {
      // Queue the AI's next turn only when it is the AI's move again is not
      // possible here (players alternate), so nothing to enqueue.
    }

    return {
      code: "OK",
      gameId,
      san: canonical.san,
      version: payload.game.version,
      thinkMs: Date.now() - started,
    };
  }

  // Bounded failure: never leave the human staring at a dead board. The game is
  // aborted and stays unrated instead of being scored against them.
  await abortAiGame(gameId);
  return fail(gameId, last);
}

/** Aborts an AI game whose engine could not move; never rates the result. */
export async function abortAiGame(gameId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("games")
    .update({
      status: "aborted",
      result: "*",
      rated: false,
      end_reason: AI_ENGINE_FAILURE_REASON,
      updated_at: new Date().toISOString(),
    })
    .eq("id", gameId)
    .eq("status", "active");
}
