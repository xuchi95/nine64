/**
 * Tournament server functions.
 *
 * Reads run as the caller (RLS keeps drafts admin-only); every write goes
 * through a security-definer RPC or the scheduler, never through a direct
 * client-side table write.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TournamentFormat, TournamentStatus } from "./types";

export interface TournamentListRow {
  id: string;
  slug: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  variant: string;
  timeControl: string;
  rated: boolean;
  startsAt: string;
  durationMinutes: number;
  roundsTotal: number;
  currentRound: number;
  maxPlayers: number | null;
  playerCount: number;
  joined: boolean;
}

export interface TournamentPlayerRow {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  rank: number | null;
  score: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  byes: number;
  streak: number;
  status: string;
  tiebreak: Record<string, number>;
}

export interface TournamentPairingRow {
  id: string;
  roundNumber: number;
  board: number;
  whiteId: string | null;
  blackId: string | null;
  whiteName: string;
  blackName: string;
  gameId: string | null;
  status: string;
  result: string | null;
  whitePoints: number;
  blackPoints: number;
}

export interface TournamentDetail {
  tournament: TournamentListRow & {
    description: string | null;
    tiebreaks: string[];
    scoring: Record<string, number | boolean>;
    endsAt: string | null;
    paused: boolean;
    lateJoin: boolean;
    minRating: number | null;
    maxRating: number | null;
  };
  players: TournamentPlayerRow[];
  pairings: TournamentPairingRow[];
  rounds: { number: number; status: string }[];
  me: { joined: boolean; status: string | null; activeGameId: string | null };
}

const SLUG = z.object({ slug: z.string().min(1).max(80) });
const ID = z.object({ id: z.string().uuid() });

function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? Number.parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

type Row = Record<string, unknown>;

function mapList(row: Row, playerCount: number, joined: boolean): TournamentListRow {
  return {
    id: row["id"] as string,
    slug: row["slug"] as string,
    name: row["name"] as string,
    format: row["format"] as TournamentFormat,
    status: row["status"] as TournamentStatus,
    variant: (row["variant"] as string) ?? "standard",
    timeControl: (row["time_control"] as string) ?? "180+2",
    rated: Boolean(row["rated"]),
    startsAt: row["starts_at"] as string,
    durationMinutes: toNum(row["duration_minutes"], 60),
    roundsTotal: toNum(row["rounds_total"], 5),
    currentRound: toNum(row["current_round"], 0),
    maxPlayers: row["max_players"] === null ? null : toNum(row["max_players"]),
    playerCount,
    joined,
  };
}

export const listTournaments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows } = await context.supabase
      .from("tournaments")
      .select("*")
      .neq("visibility", "unlisted")
      .in("status", ["scheduled", "registration", "running", "finished"])
      .order("starts_at", { ascending: false })
      .limit(60);

    const ids = ((rows ?? []) as Row[]).map((r) => r["id"] as string);
    const { data: players } = ids.length
      ? await context.supabase
          .from("tournament_players")
          .select("tournament_id, user_id, status")
          .in("tournament_id", ids)
      : { data: [] };

    const counts = new Map<string, number>();
    const mine = new Set<string>();
    for (const p of (players ?? []) as Row[]) {
      const tid = p["tournament_id"] as string;
      if (p["status"] === "active") counts.set(tid, (counts.get(tid) ?? 0) + 1);
      if (p["user_id"] === context.userId && p["status"] === "active") mine.add(tid);
    }

    return ((rows ?? []) as Row[]).map((r) =>
      mapList(r, counts.get(r["id"] as string) ?? 0, mine.has(r["id"] as string)),
    );
  });

export const getTournament = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SLUG.parse(input))
  .handler(async ({ data, context }): Promise<TournamentDetail | null> => {
    const { data: t } = await context.supabase
      .from("tournaments")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!t) return null;
    const row = t as Row;
    const id = row["id"] as string;

    const [{ data: players }, { data: pairings }, { data: rounds }] = await Promise.all([
      context.supabase
        .from("tournament_players")
        .select("*")
        .eq("tournament_id", id)
        .order("rank", { ascending: true, nullsFirst: false })
        .order("score", { ascending: false }),
      context.supabase
        .from("tournament_pairings")
        .select("*")
        .eq("tournament_id", id)
        .order("round_number", { ascending: false })
        .order("board")
        .limit(200),
      context.supabase
        .from("tournament_rounds")
        .select("number, status")
        .eq("tournament_id", id)
        .order("number"),
    ]);

    const playerRows = (players ?? []) as Row[];
    const userIds = playerRows.map((p) => p["user_id"] as string);
    const { data: profiles } = userIds.length
      ? await context.supabase
          .from("profiles")
          .select("id, display_name, avatar_url, rating")
          .in("id", userIds)
      : { data: [] };
    const profileById = new Map(
      ((profiles ?? []) as Row[]).map((p) => [p["id"] as string, p]),
    );
    const nameOf = (uid: string | null) =>
      uid ? ((profileById.get(uid)?.["display_name"] as string) ?? "—") : "—";

    const mineRow = playerRows.find((p) => p["user_id"] === context.userId);
    const pairingRows = (pairings ?? []) as Row[];
    const activeMine = pairingRows.find(
      (p) =>
        p["status"] === "active" &&
        (p["white_id"] === context.userId || p["black_id"] === context.userId),
    );

    return {
      tournament: {
        ...mapList(
          row,
          playerRows.filter((p) => p["status"] === "active").length,
          Boolean(mineRow && mineRow["status"] === "active"),
        ),
        description: (row["description"] as string) ?? null,
        tiebreaks: (row["tiebreaks"] as string[]) ?? [],
        scoring: (row["scoring"] as Record<string, number | boolean>) ?? {},
        endsAt: (row["ends_at"] as string) ?? null,
        paused: Boolean(row["paused"]),
        lateJoin: Boolean(row["late_join"]),
        minRating: row["min_rating"] === null ? null : toNum(row["min_rating"]),
        maxRating: row["max_rating"] === null ? null : toNum(row["max_rating"]),
      },
      players: playerRows.map((p) => {
        const uid = p["user_id"] as string;
        const profile = profileById.get(uid);
        return {
          userId: uid,
          displayName: (profile?.["display_name"] as string) ?? "—",
          avatarUrl: (profile?.["avatar_url"] as string) ?? null,
          rating: toNum(p["rating_at_join"], 1500),
          rank: p["rank"] === null ? null : toNum(p["rank"]),
          score: toNum(p["score"]),
          gamesPlayed: toNum(p["games_played"]),
          wins: toNum(p["wins"]),
          draws: toNum(p["draws"]),
          losses: toNum(p["losses"]),
          byes: toNum(p["byes"]),
          streak: toNum(p["streak"]),
          status: p["status"] as string,
          tiebreak: (p["tiebreak"] as Record<string, number>) ?? {},
        };
      }),
      pairings: pairingRows.map((p) => ({
        id: p["id"] as string,
        roundNumber: toNum(p["round_number"]),
        board: toNum(p["board"]),
        whiteId: (p["white_id"] as string) ?? null,
        blackId: (p["black_id"] as string) ?? null,
        whiteName: nameOf((p["white_id"] as string) ?? null),
        blackName: nameOf((p["black_id"] as string) ?? null),
        gameId: (p["game_id"] as string) ?? null,
        status: p["status"] as string,
        result: (p["result"] as string) ?? null,
        whitePoints: toNum(p["white_points"]),
        blackPoints: toNum(p["black_points"]),
      })),
      rounds: ((rounds ?? []) as Row[]).map((r) => ({
        number: toNum(r["number"]),
        status: r["status"] as string,
      })),
      me: {
        joined: Boolean(mineRow && mineRow["status"] === "active"),
        status: (mineRow?.["status"] as string) ?? null,
        activeGameId: (activeMine?.["game_id"] as string) ?? null,
      },
    };
  });

export const joinTournament = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ID.parse(input))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("tournament_join", {
      _tournament_id: data.id,
    });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; code: string };
  });

export const withdrawTournament = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ID.parse(input))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("tournament_withdraw", {
      _tournament_id: data.id,
    });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; code: string };
  });

// ---------------------------------------------------------------- admin ----

async function assertAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  const { data } = await (context.supabase as never as {
    rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: boolean | null }>;
  }).rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

const TOURNAMENT_INPUT = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "slug"),
  name: z.string().min(3).max(80),
  description: z.string().max(600).optional().nullable(),
  format: z.enum(["arena", "swiss", "round_robin", "knockout"]),
  variant: z.enum(["standard", "chess960"]).default("standard"),
  timeControl: z.string().min(3).max(12),
  rated: z.boolean().default(true),
  startsAt: z.string().min(10),
  durationMinutes: z.number().int().min(5).max(1440).default(60),
  roundsTotal: z.number().int().min(1).max(30).default(5),
  maxPlayers: z.number().int().min(2).max(512).nullable().default(null),
  minRating: z.number().int().min(0).max(4000).nullable().default(null),
  maxRating: z.number().int().min(0).max(4000).nullable().default(null),
  lateJoin: z.boolean().default(true),
  tiebreaks: z.array(z.string()).default(["buchholz", "sonneborn_berger"]),
  scoring: z.record(z.string(), z.union([z.number(), z.boolean()])).default({}),
  status: z.enum(["draft", "scheduled", "cancelled"]).default("scheduled"),
});

export const adminSaveTournament = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TOURNAMENT_INPUT.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      slug: data.slug,
      name: data.name,
      description: data.description ?? null,
      format: data.format,
      variant: data.variant,
      time_control: data.timeControl,
      rated: data.rated,
      starts_at: new Date(data.startsAt).toISOString(),
      duration_minutes: data.durationMinutes,
      rounds_total: data.roundsTotal,
      max_players: data.maxPlayers,
      min_rating: data.minRating,
      max_rating: data.maxRating,
      late_join: data.lateJoin,
      tiebreaks: data.tiebreaks,
      scoring: data.scoring as never,
      status: data.status,
      created_by: context.userId,
    };
    const query = data.id
      ? supabaseAdmin.from("tournaments").update(payload).eq("id", data.id).select("id").maybeSingle()
      : supabaseAdmin.from("tournaments").insert(payload).select("id").maybeSingle();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true, id: (saved as Row | null)?.["id"] as string };
  });

export const adminSetTournamentState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["publish", "pause", "resume", "cancel"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> =
      data.action === "publish"
        ? { status: "scheduled" }
        : data.action === "cancel"
          ? { status: "cancelled" }
          : { paused: data.action === "pause" };
    const { error } = await supabaseAdmin.from("tournaments").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("tournament_events").insert({
      tournament_id: data.id,
      type: `admin_${data.action}`,
      actor_id: context.userId,
    });
    return { ok: true };
  });

/** Fair Play: void a pairing's contribution, then recompute the table. */
export const adminInvalidatePairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ pairingId: z.string().uuid(), reason: z.string().min(3).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("tournament_invalidate_pairing", {
      _pairing_id: data.pairingId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    const tournamentId = (res as Row | null)?.["tournament_id"] as string | undefined;
    if (tournamentId) {
      const { runTournamentTick } = await import("./scheduler.server");
      await runTournamentTick(tournamentId);
    }
    return { ok: true };
  });

/** Manual scheduler kick from the admin UI. */
export const adminTickTournaments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid().optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { runScheduler, runTournamentTick } = await import("./scheduler.server");
    return data.id ? { results: [await runTournamentTick(data.id)] } : await runScheduler();
  });

export const adminListTournaments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .order("starts_at", { ascending: false })
      .limit(100);
    return ((data ?? []) as Row[]).map((r) => ({
      ...mapList(r, 0, false),
      paused: Boolean(r["paused"]),
      visibility: (r["visibility"] as string) ?? "public",
    }));
  });

export const adminTournamentEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ID.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("tournament_events")
      .select("id, type, payload, created_at")
      .eq("tournament_id", data.id)
      .order("created_at", { ascending: false })
      .limit(50);
    return ((rows ?? []) as Row[]).map((r) => ({
      id: r["id"] as string,
      type: r["type"] as string,
      payload: (r["payload"] as Record<string, unknown>) ?? {},
      createdAt: r["created_at"] as string,
    }));
  });
