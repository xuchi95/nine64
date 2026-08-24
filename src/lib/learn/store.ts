import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_RATING,
  glicko2Update,
  type Rating,
} from "@/lib/rating/glicko2";
import { review as reviewCard, type Grade, type SrsState } from "./fsrs";
import type { Puzzle } from "./puzzleGen";
import type { ArmStats } from "./bandit";

export interface LearnState {
  puzzles: Puzzle[];
  /** Solver's puzzle rating (Glicko-2). */
  rating: Rating;
  bandit: Record<string, ArmStats>;
}

const KEY = "nexus-chess.learn.v1";

let state: LearnState = { puzzles: [], rating: { ...DEFAULT_RATING }, bandit: {} };
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
  void syncToCloud();
}

export function hydrateLearn() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LearnState>;
      state = {
        puzzles: Array.isArray(parsed.puzzles) ? parsed.puzzles : [],
        rating: parsed.rating ?? { ...DEFAULT_RATING },
        bandit: parsed.bandit ?? {},
      };
    }
  } catch {
    /* corrupted storage — start clean */
  }
  emit();
  void pullFromCloud();
}

/* --------------------------------- cloud --------------------------------- */

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

/** Best-effort mirror of local puzzles/SRS into the user's cloud rows. */
async function syncToCloud() {
  if (typeof window === "undefined") return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    const userId = await currentUserId();
    if (!userId) return;
    const rows = state.puzzles.slice(0, 200).map((p) => ({
      id: p.id,
      user_id: userId,
      fen: p.fen,
      solution: p.solution,
      solution_san: p.solutionSan,
      color: p.color,
      themes: p.themes,
      rating: p.rating,
      source_game_id: p.gameId,
      ply: p.ply,
      swing: p.swing,
      attempts: p.attempts,
      solved: p.solved,
      srs: p.srs as unknown as never,
    }));
    if (rows.length === 0) return;
    try {
      await supabase.from("puzzles").upsert(rows, { onConflict: "id" });
    } catch {
      /* offline — local storage remains the source of truth */
    }
  }, 1500);
}

async function pullFromCloud() {
  const userId = await currentUserId();
  if (!userId) return;
  try {
    const { data } = await supabase
      .from("puzzles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (!data) return;
    const local = new Map(state.puzzles.map((p) => [p.id, p]));
    for (const row of data as unknown as Record<string, unknown>[]) {
      const id = String(row["id"]);
      if (local.has(id)) continue;
      local.set(id, {
        id,
        fen: String(row["fen"]),
        solution: String(row["solution"]),
        solutionSan: (row["solution_san"] as string | null) ?? null,
        color: row["color"] === "b" ? "b" : "w",
        themes: (row["themes"] as Puzzle["themes"]) ?? [],
        rating: Number(row["rating"] ?? 1200),
        gameId: String(row["source_game_id"] ?? ""),
        ply: Number(row["ply"] ?? 0),
        swing: Number(row["swing"] ?? 0),
        createdAt: String(row["created_at"] ?? new Date().toISOString()),
        srs: row["srs"] as unknown as SrsState,
        attempts: Number(row["attempts"] ?? 0),
        solved: Number(row["solved"] ?? 0),
      });
    }
    state = { ...state, puzzles: [...local.values()] };
    emit();
  } catch {
    /* ignore — cloud sync is optional */
  }
}

/* -------------------------------- mutations ------------------------------- */

export function addPuzzles(puzzles: Puzzle[]): number {
  hydrateLearn();
  const existing = new Set(state.puzzles.map((p) => p.id));
  const fresh = puzzles.filter((p) => !existing.has(p.id));
  if (fresh.length === 0) return 0;
  state = { ...state, puzzles: [...fresh, ...state.puzzles].slice(0, 400) };
  persist();
  emit();
  return fresh.length;
}

export function gradePuzzle(id: string, grade: Grade) {
  hydrateLearn();
  const puzzle = state.puzzles.find((p) => p.id === id);
  if (!puzzle) return;
  const score = grade === 1 ? 0 : grade === 2 ? 0.5 : 1;
  const nextRating = glicko2Update(state.rating, [
    { rating: puzzle.rating, rd: 80, score },
  ]);
  const srs: SrsState = reviewCard(puzzle.srs, grade);
  state = {
    ...state,
    rating: nextRating,
    puzzles: state.puzzles.map((p) =>
      p.id === id
        ? { ...p, srs, attempts: p.attempts + 1, solved: p.solved + (score === 1 ? 1 : 0) }
        : p,
    ),
  };
  persist();
  emit();
}

export function recordBanditResult(armId: string, reward: number) {
  hydrateLearn();
  const prev = state.bandit[armId] ?? { id: armId, pulls: 0, reward: 0 };
  state = {
    ...state,
    bandit: { ...state.bandit, [armId]: { id: armId, pulls: prev.pulls + 1, reward: prev.reward + reward } },
  };
  persist();
  emit();
}

export function resetLearn() {
  state = { puzzles: [], rating: { ...DEFAULT_RATING }, bandit: {} };
  persist();
  emit();
}

/* ---------------------------------- hooks --------------------------------- */

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const SERVER_SNAPSHOT: LearnState = { puzzles: [], rating: { ...DEFAULT_RATING }, bandit: {} };

export function useLearnState(): LearnState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_SNAPSHOT,
  );
}

export function learnState(): LearnState {
  return state;
}
