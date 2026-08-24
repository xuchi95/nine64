import { useSyncExternalStore } from "react";
import type { MoveRecord, GameResult, Color } from "@/hooks/useChessGame";
import type { PlyAnalysis, DeepReviewSummary } from "@/lib/analysis/types";
import type { FairplayReport } from "@/lib/fairplay/score";
import type { CoachReport } from "@/lib/coach/types";

export interface GameReview {
  /** Centipawn evaluation (white POV) after each move; null when unavailable. */
  evals: (number | null)[];
  /** Evaluation of the starting position, white POV. */
  startEval: number;
  accuracy: { w: number; b: number };
  reviewedAt: string;
  /** Deep per-move analysis (classification, motifs, complexity). */
  plies?: PlyAnalysis[];
  summary?: DeepReviewSummary;
  fairplay?: { w: FairplayReport; b: FairplayReport };
}


export interface SavedGame {
  id: string;
  playedAt: string;
  mode: "ai" | "local";
  variant: string;
  variantName: string;
  timeControl: string;
  startFen: string;
  finalFen: string;
  moves: MoveRecord[];
  result: GameResult;
  /** Perspective of the human in AI games; null for local two-player. */
  playerColor: Color | null;
  white: { name: string; subtitle?: string };
  black: { name: string; subtitle?: string };
  opening: string | null;
  review?: GameReview;
  /** AI coach commentary, generated on demand. */
  coach?: CoachReport;
}

async function syncUp(game: SavedGame) {
  try {
    const { pushGame } = await import("@/lib/historySync");
    await pushGame(game);
  } catch {
    /* offline or signed out — local copy stays authoritative */
  }
}

async function syncDelete(id: string) {
  try {
    const { removeGame } = await import("@/lib/historySync");
    await removeGame(id);
  } catch {
    /* best effort */
  }
}

async function syncClear() {
  try {
    const { removeAllGames } = await import("@/lib/historySync");
    await removeAllGames();
  } catch {
    /* best effort */
  }
}

const KEY = "nexus-chess.history.v1";
const MAX_GAMES = 300;

let state: SavedGame[] = [];
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
    /* storage full or unavailable — history stays in memory for this session */
  }
}

function read(): SavedGame[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedGame[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function hydrateHistory() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  state = read();
  emit();
}

export function listGames(): SavedGame[] {
  return state;
}

export function getGame(id: string): SavedGame | null {
  return state.find((g) => g.id === id) ?? null;
}

export function saveGame(game: Omit<SavedGame, "id" | "playedAt">): SavedGame {
  hydrateHistory();
  const record: SavedGame = {
    ...game,
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    playedAt: new Date().toISOString(),
  };
  state = [record, ...state].slice(0, MAX_GAMES);
  persist();
  emit();
  void syncUp(record);
  return record;
}

/** Merges games coming from the account archive, keeping local copies on conflict. */
export function mergeGames(games: SavedGame[]) {
  hydrateHistory();
  const known = new Set(state.map((g) => g.id));
  const extra = games.filter((g) => !known.has(g.id));
  if (extra.length === 0) return;
  state = [...state, ...extra]
    .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())
    .slice(0, MAX_GAMES);
  persist();
  emit();
}

export function attachReview(id: string, review: GameReview) {
  state = state.map((g) => (g.id === id ? { ...g, review } : g));
  persist();
  emit();
  const updated = state.find((g) => g.id === id);
  if (updated) void syncUp(updated);
}

export function attachCoach(id: string, coach: CoachReport) {
  state = state.map((g) => (g.id === id ? { ...g, coach } : g));
  persist();
  emit();
  const updated = state.find((g) => g.id === id);
  if (updated) void syncUp(updated);
}

export function deleteGame(id: string) {
  state = state.filter((g) => g.id !== id);
  persist();
  emit();
  void syncDelete(id);
}

export function clearHistory() {
  state = [];
  persist();
  emit();
  void syncClear();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: SavedGame[] = [];

export function useGameHistory(): SavedGame[] {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
}

export function useSavedGame(id: string): SavedGame | null {
  const games = useGameHistory();
  return games.find((g) => g.id === id) ?? null;
}

/* ---------------------------------- stats --------------------------------- */

export interface HistoryStats {
  total: number;
  wins: number;
  losses: number;
  draws: number;
}

export function historyStats(games: SavedGame[]): HistoryStats {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const g of games) {
    if (g.result.winner === "draw") draws += 1;
    else if (g.playerColor === null) continue;
    else if (g.result.winner === g.playerColor) wins += 1;
    else losses += 1;
  }
  return { total: games.length, wins, losses, draws };
}

/** Outcome label from the saved perspective. */
export function outcomeLabel(game: SavedGame): "Win" | "Loss" | "Draw" | "White" | "Black" {
  if (game.result.winner === "draw") return "Draw";
  if (game.playerColor === null) return game.result.winner === "w" ? "White" : "Black";
  return game.result.winner === game.playerColor ? "Win" : "Loss";
}

/* --------------------------- accuracy / eval math -------------------------- */

/** Lichess-style win percentage from centipawns (white POV). */
export function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

function moveAccuracy(before: number, after: number): number {
  const drop = Math.max(0, before - after);
  const raw = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Average accuracy per side from a sequence of evaluations (white POV, cp).
 * `evals[i]` is the evaluation after move `i`; `startEval` precedes them.
 */
export function computeAccuracy(
  startEval: number,
  evals: (number | null)[],
  moves: MoveRecord[],
): { w: number; b: number } {
  const scores: { w: number[]; b: number[] } = { w: [], b: [] };
  let prev = winPercent(startEval);
  evals.forEach((cp, i) => {
    const mover = moves[i]?.color;
    if (cp === null || !mover) return;
    const current = winPercent(cp);
    // From the mover's perspective, higher is better.
    const before = mover === "w" ? prev : 100 - prev;
    const after = mover === "w" ? current : 100 - current;
    scores[mover].push(moveAccuracy(before, after));
    prev = current;
  });
  const avg = (xs: number[]) =>
    xs.length === 0 ? 0 : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
  return { w: avg(scores.w), b: avg(scores.b) };
}

export function formatEval(cp: number | null): string {
  if (cp === null) return "—";
  if (Math.abs(cp) >= 1200) return cp > 0 ? "+M" : "-M";
  return `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)}`;
}

export function toPgn(game: SavedGame): string {
  const resultTag =
    game.result.winner === "draw" ? "1/2-1/2" : game.result.winner === "w" ? "1-0" : "0-1";
  const header = [
    `[Event "Nexus Chess — ${game.variantName}"]`,
    `[Date "${game.playedAt.slice(0, 10).replace(/-/g, ".")}"]`,
    `[White "${game.white.name}"]`,
    `[Black "${game.black.name}"]`,
    `[Result "${resultTag}"]`,
    `[TimeControl "${game.timeControl}"]`,
    `[Termination "${game.result.reason}"]`,
    `[FEN "${game.startFen}"]`,
  ].join("\n");
  const body = game.moves
    .map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m.san}` : m.san))
    .join(" ");
  return `${header}\n\n${body} ${resultTag}`.trim();
}
