/**
 * Loads every deterministic input the Personal Chess Brain needs.
 * Server-only: it runs with the caller's RLS-scoped Supabase client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSkillKey, type SkillKey } from "@/lib/skills/catalog";
import type { BrainEvent, BrainGame } from "./profile";
import type { RetryCandidate } from "./plan";
import type { SessionSummary } from "./weekly";

const LOOKBACK_DAYS = 90;
const DAY = 86_400_000;

export interface BrainSnapshot {
  events: BrainEvent[];
  games: BrainGame[];
  sessions: (SessionSummary & { budgetMinutes: number; status: string })[];
  dueCards: number;
  retryCandidates: RetryCandidate[];
  rating: number;
}

function toEvent(row: {
  skill_key: string;
  outcome: string;
  source: string;
  created_at: string;
  detail: unknown;
}): BrainEvent | null {
  if (!isSkillKey(row.skill_key)) return null;
  const detail = (row.detail ?? {}) as Record<string, unknown>;
  const outcome = row.outcome === "positive" || row.outcome === "negative" ? row.outcome : "neutral";
  return {
    skillKey: row.skill_key as SkillKey,
    outcome,
    source: row.source,
    createdAt: row.created_at,
    ...(typeof detail['label'] === "string" ? { label: detail['label'] } : {}),
    ...(typeof detail['phase'] === "string" ? { phase: detail['phase'] } : {}),
    ...(typeof detail['complex'] === "boolean" ? { complex: detail['complex'] } : {}),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadBrainSnapshot(supabase: SupabaseClient<any, any, any>, uid: string): Promise<BrainSnapshot> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * DAY).toISOString();
  const nowIso = new Date().toISOString();

  const [events, games, cards, sessions, profile] = await Promise.all([
    supabase
      .from("skill_events")
      .select("skill_key, outcome, source, created_at, detail, game_id, ply")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("games")
      .select("id, status, winner_id, updated_at")
      .or(`white_id.eq.${uid},black_id.eq.${uid}`)
      .eq("status", "finished")
      .order("updated_at", { ascending: false })
      .limit(40),
    supabase.from("training_cards").select("srs").limit(500),
    supabase
      .from("training_sessions")
      .select("day, budget_minutes, minutes_spent, completed_blocks, failed_blocks, status")
      .order("day", { ascending: false })
      .limit(30),
    supabase.from("profiles").select("rating").eq("id", uid).maybeSingle(),
  ]);

  if (events.error) throw new Error("BRAIN_EVENTS_UNAVAILABLE");

  const rows = (events.data ?? []) as {
    skill_key: string;
    outcome: string;
    source: string;
    created_at: string;
    detail: unknown;
    game_id: string | null;
    ply: number | null;
  }[];

  const brainEvents = rows.map(toEvent).filter((e): e is BrainEvent => e !== null);

  const retryCandidates: RetryCandidate[] = rows
    .filter((r) => {
      const detail = (r.detail ?? {}) as Record<string, unknown>;
      const label = typeof detail['label'] === "string" ? detail['label'] : "";
      return (
        r.outcome === "negative" &&
        !!r.game_id &&
        (label === "blunder" || label === "mistake" || label === "miss")
      );
    })
    .slice(0, 5)
    .map((r) => ({
      gameId: String(r.game_id),
      ply: r.ply ?? 0,
      label: String(((r.detail ?? {}) as Record<string, unknown>)['label'] ?? "mistake"),
    }));

  const gameRows = (games.data ?? []) as { id: string; winner_id: string | null; updated_at: string }[];
  const brainGames: BrainGame[] = gameRows.map((g) => ({
    id: g.id,
    endedAt: g.updated_at,
    result: g.winner_id === null ? "draw" : g.winner_id === uid ? "win" : "loss",
  }));

  const cardRows = (cards.data ?? []) as { srs: unknown }[];
  const dueCards = cardRows.filter((c) => {
    const srs = (c.srs ?? {}) as Record<string, unknown>;
    const due = typeof srs['due'] === "string" ? srs['due'] : null;
    return due !== null && due <= nowIso;
  }).length;

  const sessionRows = (sessions.data ?? []) as {
    day: string;
    budget_minutes: number;
    minutes_spent: number;
    completed_blocks: number;
    failed_blocks: number;
    status: string;
  }[];

  const profileRating = (profile.data as { rating?: number } | null)?.rating ?? 1200;

  return {
    events: brainEvents,
    games: brainGames,
    sessions: sessionRows.map((s) => ({
      date: s.day,
      minutes: s.minutes_spent,
      completedBlocks: s.completed_blocks,
      failedBlocks: s.failed_blocks,
      budgetMinutes: s.budget_minutes,
      status: s.status,
    })),
    dueCards,
    retryCandidates,
    rating: profileRating,
  };
}
