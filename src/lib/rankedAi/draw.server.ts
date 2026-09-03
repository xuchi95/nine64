/**
 * Draw-offer behaviour for ranked AI opponents — SERVER ONLY.
 *
 * A human offering a draw to an AI profile used to get silence, which reads as
 * a broken opponent. The AI now answers like a person would: it accepts when it
 * is worse or the position is a long, level grind, and politely declines while
 * it is still better.
 */
import { Chess } from "chess.js";

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3.25, r: 5, q: 9, k: 0 };

/** Material balance in pawns, from White's point of view. */
export function materialBalance(fen: string): number {
  try {
    const board = new Chess(fen).board();
    let score = 0;
    for (const row of board) {
      for (const square of row) {
        if (!square) continue;
        const value = PIECE_VALUE[square.type] ?? 0;
        score += square.color === "w" ? value : -value;
      }
    }
    return score;
  } catch {
    return 0;
  }
}

export interface DrawDecisionInput {
  /** Material balance from the AI's point of view (positive = AI better). */
  edge: number;
  /** Half-moves played so far. */
  ply: number;
  /** 0..1 deterministic-ish roll, injectable for tests. */
  roll: number;
}

/** Human-like accept/decline policy. */
export function decideDraw({ edge, ply, roll }: DrawDecisionInput): boolean {
  if (edge <= -2) return roll < 0.95; // clearly worse: take the half point
  if (edge <= -0.5) return roll < 0.8;
  if (edge < 0.5) return roll < (ply >= 60 ? 0.6 : ply >= 30 ? 0.35 : 0.15);
  if (edge < 2) return roll < 0.1;
  return false; // winning: play on
}

const ACCEPT_LINES = ["ok hoà nhé", "được, hoà thôi", "gg, hoà nha", "ừ hoà đi"];
const DECLINE_LINES = ["thôi chơi tiếp nhé", "chưa hoà đâu :)", "để đánh thêm chút", "chơi tiếp đã"];

/**
 * Answers a pending draw offer when the recipient is an AI profile.
 * Safe to call for any game: it no-ops for human games or when nothing pends.
 */
export async function maybeAiDrawResponse(gameId: string): Promise<"accepted" | "declined" | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: game } = await supabaseAdmin
    .from("games")
    .select("id, status, version, current_fen, white_id, ai_game, ai_profile_id")
    .eq("id", gameId)
    .maybeSingle();

  if (!game || !game.ai_game || !game.ai_profile_id || game.status !== "active") return null;
  const aiId = game.ai_profile_id as string;

  const { data: offer } = await supabaseAdmin
    .from("game_draw_offers")
    .select("id, status, offered_to, expires_at")
    .eq("game_id", gameId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!offer || offer.offered_to !== aiId) return null;
  if (Date.parse(offer.expires_at as string) <= Date.now()) return null;

  const fen = (game.current_fen as string) ?? "";
  const white = materialBalance(fen);
  const edge = game.white_id === aiId ? white : -white;
  let ply = 0;
  try {
    ply = Number(fen.split(" ")[5] ?? 1) * 2 - 2;
  } catch {
    ply = 0;
  }

  const accept = decideDraw({ edge, ply, roll: Math.random() });

  const rpc = accept ? "accept_draw_internal" : "respond_draw_internal";
  const args = accept
    ? {
        _game_id: gameId,
        _offer_id: offer.id,
        _user_id: aiId,
        _expected_version: game.version as number,
      }
    : { _game_id: gameId, _offer_id: offer.id, _user_id: aiId, _action: "decline" };

  const { error } = await supabaseAdmin.rpc(rpc as never, args as never);
  if (error) {
    console.error("[rankedAi.draw] response failed", error.message);
    return null;
  }

  const pool = accept ? ACCEPT_LINES : DECLINE_LINES;
  await supabaseAdmin.from("game_chat_messages").insert({
    game_id: gameId,
    user_id: aiId,
    body: pool[Math.floor(Math.random() * pool.length)]!,
    ply: Math.max(0, ply),
  });

  return accept ? "accepted" : "declined";
}
