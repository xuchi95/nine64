import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { hydrateHistory, listGames, mergeGames, type SavedGame } from "@/lib/history";

/**
 * Two-way sync of the offline archive (bot + pass & play games) with the
 * signed-in account. Local storage stays the source of truth while signed out;
 * on sign-in every local game is pushed and every cloud game is merged back.
 */

type Row = {
  client_id: string;
  played_at: string;
  mode: string;
  payload: unknown;
};

function toRow(userId: string, game: SavedGame) {
  return {
    user_id: userId,
    client_id: game.id,
    played_at: game.playedAt,
    mode: game.mode,
    payload: JSON.parse(JSON.stringify(game)) as Json,
  };
}

function fromRow(row: Row): SavedGame | null {
  const payload = row.payload as SavedGame | null;
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.moves)) return null;
  return { ...payload, id: row.client_id, playedAt: row.played_at };
}

/** Pushes one game (new or reviewed) to the account when signed in. */
export async function pushGame(game: SavedGame): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return;
  await supabase.from("offline_games").upsert(toRow(userId, game), { onConflict: "user_id,client_id" });
}

/** Removes a game from the account archive. */
export async function removeGame(clientId: string): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return;
  await supabase.from("offline_games").delete().eq("user_id", userId).eq("client_id", clientId);
}

/** Removes every synced offline game from the account archive. */
export async function removeAllGames(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return;
  await supabase.from("offline_games").delete().eq("user_id", userId);
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

/** Full reconciliation: upload local-only games, merge down cloud-only games. */
export async function syncHistory(userId: string): Promise<SyncResult> {
  hydrateHistory();
  const local = listGames();

  const { data: rows, error } = await supabase
    .from("offline_games")
    .select("client_id, played_at, mode, payload")
    .eq("user_id", userId)
    .order("played_at", { ascending: false });
  if (error) throw error;

  const cloud = (rows ?? []) as Row[];
  const cloudIds = new Set(cloud.map((r) => r.client_id));

  const toPush = local.filter((g) => !cloudIds.has(g.id));
  if (toPush.length > 0) {
    const { error: upErr } = await supabase
      .from("offline_games")
      .upsert(toPush.map((g) => toRow(userId, g)), { onConflict: "user_id,client_id" });
    if (upErr) throw upErr;
  }

  const localIds = new Set(local.map((g) => g.id));
  const incoming = cloud
    .filter((r) => !localIds.has(r.client_id))
    .map(fromRow)
    .filter((g): g is SavedGame => g !== null);
  if (incoming.length > 0) mergeGames(incoming);

  return { pushed: toPush.length, pulled: incoming.length };
}
