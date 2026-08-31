/**
 * Supabase-backed `TournamentStore`.
 *
 * Every mutation goes through a security-definer RPC so the engine can only
 * take the moves the database considers legal, and so concurrent workers
 * converge instead of racing (advisory locks + unique keys inside the RPCs).
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  GameStateRecord,
  ScoreWriteRow,
  TournamentSnapshot,
  TournamentStore,
} from "./engine";
import type { PairingResult, PairingSlot, StandingRow, TournamentStatus } from "./types";

type Row = Record<string, unknown>;

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? Number.parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

export function createSupabaseTournamentStore(): TournamentStore {
  const db = supabaseAdmin;

  return {
    async loadSnapshot(tournamentId: string): Promise<TournamentSnapshot | null> {
      const [{ data: t }, { data: players }, { data: rounds }, { data: pairings }, { data: scores }] =
        await Promise.all([
          db.from("tournaments").select("*").eq("id", tournamentId).maybeSingle(),
          db.from("tournament_players").select("*").eq("tournament_id", tournamentId),
          db.from("tournament_rounds").select("*").eq("tournament_id", tournamentId).order("number"),
          db
            .from("tournament_pairings")
            .select("*")
            .eq("tournament_id", tournamentId)
            .order("round_number")
            .order("board"),
          db.from("tournament_scores").select("*").eq("tournament_id", tournamentId),
        ]);
      if (!t) return null;
      const row = t as Row;

      return {
        tournament: {
          id: row["id"] as string,
          format: row["format"] as TournamentSnapshot["tournament"]["format"],
          status: row["status"] as TournamentStatus,
          variant: (row["variant"] as string) ?? "standard",
          timeControl: (row["time_control"] as string) ?? "180+2",
          scoring: (row["scoring"] as Record<string, unknown>) ?? {},
          tiebreaks: (row["tiebreaks"] as string[]) ?? [],
          startsAt: row["starts_at"] as string,
          registrationOpensAt: (row["registration_opens_at"] as string) ?? null,
          endsAt: (row["ends_at"] as string) ?? null,
          durationMinutes: num(row["duration_minutes"], 60),
          roundsTotal: num(row["rounds_total"], 5),
          currentRound: num(row["current_round"], 0),
          paused: Boolean(row["paused"]),
          lateJoin: Boolean(row["late_join"]),
        },
        players: ((players ?? []) as Row[]).map((p, index) => ({
          userId: p["user_id"] as string,
          rating: num(p["rating_at_join"], 1500),
          seed: num(p["seed"], index + 1),
          status: p["status"] as "active" | "withdrawn" | "removed",
        })),
        rounds: ((rounds ?? []) as Row[]).map((r) => ({
          id: r["id"] as string,
          number: num(r["number"]),
          status: r["status"] as "pairing" | "running" | "finished",
        })),
        pairings: ((pairings ?? []) as Row[]).map((p) => ({
          id: p["id"] as string,
          roundNumber: num(p["round_number"]),
          board: num(p["board"]),
          whiteId: (p["white_id"] as string) ?? null,
          blackId: (p["black_id"] as string) ?? null,
          gameId: (p["game_id"] as string) ?? null,
          status: p["status"] as "pending" | "active" | "finished" | "bye" | "void",
          result: (p["result"] as PairingResult) ?? null,
          bracketSlot: p["bracket_slot"] === null ? null : num(p["bracket_slot"]),
        })),
        scores: ((scores ?? []) as Row[]).map((s) => ({
          pairingId: s["pairing_id"] as string,
          userId: s["user_id"] as string,
          points: num(s["points"]),
          outcome: s["outcome"] as "win" | "draw" | "loss" | "bye" | "void",
        })),
      };
    },

    async setStatus(tournamentId, status, patch) {
      await db
        .from("tournaments")
        .update({ status, ...(patch ?? {}) })
        .eq("id", tournamentId);
    },

    async openRound(tournamentId, number) {
      const { data, error } = await db.rpc("tournament_open_round", {
        _tournament_id: tournamentId,
        _number: number,
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as Row;
      return { roundId: (res["round_id"] as string) ?? "", created: Boolean(res["created"]) };
    },

    async applyPairings(tournamentId, roundNumber, slots: PairingSlot[]) {
      const payload = slots.map((s) => ({
        board: s.board,
        white_id: s.whiteId,
        black_id: s.blackId,
        status: s.status,
        result: s.result,
        bracket_slot: s.bracketSlot ?? null,
      }));
      const { error } = await db.rpc("tournament_apply_pairings", {
        _tournament_id: tournamentId,
        _round_number: roundNumber,
        _pairings: payload as never,
      });
      if (error) throw new Error(error.message);
    },

    async startGame(pairingId, initialFen) {
      const { error } = await db.rpc("tournament_start_pairing_game", {
        _pairing_id: pairingId,
        _initial_fen: initialFen,
      });
      if (error) throw new Error(error.message);
    },

    async loadGames(gameIds): Promise<GameStateRecord[]> {
      if (gameIds.length === 0) return [];
      const { data } = await db
        .from("games")
        .select("id, status, result, winner_id")
        .in("id", gameIds);
      return ((data ?? []) as Row[]).map((g) => ({
        id: g["id"] as string,
        status: g["status"] as string,
        result: (g["result"] as string) ?? null,
        winnerId: (g["winner_id"] as string) ?? null,
      }));
    },

    async recordResult(pairingId, result: PairingResult, rows: ScoreWriteRow[]) {
      const { error } = await db.rpc("tournament_record_pairing_result", {
        _pairing_id: pairingId,
        _result: result,
        _rows: rows as never,
      });
      if (error) throw new Error(error.message);
    },

    async setStandings(tournamentId, rows: StandingRow[]) {
      const payload = rows.map((r) => ({
        user_id: r.userId,
        rank: r.rank,
        score: r.score,
        games_played: r.gamesPlayed,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        byes: r.byes,
        streak: r.streak,
        colour_balance: r.colourBalance,
        eliminated_round: r.eliminatedRound,
        tiebreak: r.tiebreak,
      }));
      const { error } = await db.rpc("tournament_set_standings", {
        _tournament_id: tournamentId,
        _rows: payload as never,
      });
      if (error) throw new Error(error.message);
    },

    async logEvent(tournamentId, type, payload) {
      await db.from("tournament_events").insert({
        tournament_id: tournamentId,
        type,
        payload: payload as never,
      });
    },

    async finishRound(roundId) {
      await db
        .from("tournament_rounds")
        .update({ status: "finished", finished_at: new Date().toISOString() })
        .eq("id", roundId);
    },
  };
}

/** Acquire the scheduler lease, run the engine, then release it. */
export async function withTournamentLease<T>(
  tournamentId: string,
  owner: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const { data: acquired, error } = await supabaseAdmin.rpc("tournament_acquire_lease", {
    _tournament_id: tournamentId,
    _owner: owner,
    _ttl_seconds: 60,
  });
  if (error) throw new Error(error.message);
  if (!acquired) return null;
  try {
    return await fn();
  } finally {
    await supabaseAdmin.rpc("tournament_release_lease", {
      _tournament_id: tournamentId,
      _owner: owner,
    });
  }
}

/** Tournaments the scheduler should look at right now. */
export async function listSchedulableTournaments(limit = 25): Promise<string[]> {
  const soon = new Date(Date.now() + 5 * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("tournaments")
    .select("id, status, starts_at, registration_opens_at")
    .in("status", ["scheduled", "registration", "running"])
    .or(`status.eq.running,status.eq.registration,starts_at.lte.${soon}`)
    .order("starts_at")
    .limit(limit);
  return ((data ?? []) as Row[]).map((r) => r["id"] as string);
}
