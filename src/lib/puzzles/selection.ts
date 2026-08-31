/**
 * Puzzle selection scoring.
 *
 * Deterministic and pure so it can be unit-tested: the caller loads a candidate
 * pool (rating band + mode filter) and this ranks it by combining
 *   rating match + weakness score + FSRS urgency + theme diversity
 *   - recent duplication penalty.
 */
import { retrievability } from "@/lib/learn/fsrs";
import type { PlatformPuzzle, SrsCard } from "./types";
import type { ThemeKey } from "./themes";

const DAY_MS = 86_400_000;

export interface SelectionContext {
  /** Solver's puzzle rating. */
  rating: number;
  /** 0-100 weakness per theme (higher = weaker = more valuable to train). */
  weakness: Partial<Record<ThemeKey, number>>;
  /** FSRS cards keyed by puzzle id. */
  cards: Record<string, SrsCard>;
  /** Puzzle ids attempted recently, newest first. */
  recentPuzzleIds: string[];
  /** Themes seen in the current session, for diversity. */
  sessionThemes: ThemeKey[];
  now: Date;
}

export interface ScoredPuzzle {
  puzzle: PlatformPuzzle;
  score: number;
  parts: {
    ratingMatch: number;
    weakness: number;
    srsUrgency: number;
    diversity: number;
    duplication: number;
  };
  /** Why this puzzle was chosen, surfaced in the UI. */
  reasons: string[];
}

const WEIGHT = {
  ratingMatch: 40,
  weakness: 25,
  srsUrgency: 30,
  diversity: 10,
  duplication: 60,
};

/** 1 at a perfect rating match, decaying to 0 about 400 points away. */
export function ratingMatchScore(userRating: number, puzzleRating: number): number {
  const delta = Math.abs(userRating - puzzleRating);
  return Math.max(0, 1 - delta / 400);
}

export function weaknessScore(
  themes: readonly ThemeKey[],
  weakness: SelectionContext["weakness"],
): number {
  if (themes.length === 0) return 0;
  const values = themes.map((t) => (weakness[t] ?? 0) / 100);
  return Math.max(...values);
}

/** Overdue cards score highest; unseen puzzles sit in the middle. */
export function srsUrgency(card: SrsCard | undefined, now: Date): number {
  if (!card) return 0.35;
  const dueMs = new Date(card.due).getTime() - now.getTime();
  if (dueMs <= 0) {
    const overdueDays = Math.min(30, -dueMs / DAY_MS);
    return Math.min(1, 0.7 + overdueDays / 60);
  }
  const elapsed = card.lastReview
    ? (now.getTime() - new Date(card.lastReview).getTime()) / DAY_MS
    : 0;
  return Math.max(0, 0.5 * (1 - retrievability(card.stability, elapsed)));
}

export function diversityScore(
  themes: readonly ThemeKey[],
  sessionThemes: readonly ThemeKey[],
): number {
  if (themes.length === 0) return 0.5;
  const seen = new Set(sessionThemes);
  const fresh = themes.filter((t) => !seen.has(t)).length;
  return fresh / themes.length;
}

/**
 * Recently attempted puzzles are heavily penalised. An SRS card that is due
 * overrides the penalty — that is exactly the case where a repeat is wanted.
 */
export function duplicationPenalty(
  puzzleId: string,
  recent: readonly string[],
  card: SrsCard | undefined,
  now: Date,
): number {
  const index = recent.indexOf(puzzleId);
  if (index < 0) return 0;
  const recency = 1 - index / Math.max(1, recent.length);
  const srsDue = card ? new Date(card.due).getTime() <= now.getTime() : false;
  return srsDue ? recency * 0.15 : recency;
}

export function scorePuzzle(puzzle: PlatformPuzzle, ctx: SelectionContext): ScoredPuzzle {
  const card = ctx.cards[puzzle.id];
  const parts = {
    ratingMatch: ratingMatchScore(ctx.rating, puzzle.rating),
    weakness: weaknessScore(puzzle.themes, ctx.weakness),
    srsUrgency: srsUrgency(card, ctx.now),
    diversity: diversityScore(puzzle.themes, ctx.sessionThemes),
    duplication: duplicationPenalty(puzzle.id, ctx.recentPuzzleIds, card, ctx.now),
  };
  const score =
    parts.ratingMatch * WEIGHT.ratingMatch +
    parts.weakness * WEIGHT.weakness +
    parts.srsUrgency * WEIGHT.srsUrgency +
    parts.diversity * WEIGHT.diversity -
    parts.duplication * WEIGHT.duplication;

  const reasons: string[] = [];
  if (parts.srsUrgency >= 0.7) reasons.push("srs_due");
  if (parts.weakness >= 0.5) reasons.push("weak_theme");
  if (parts.ratingMatch >= 0.8) reasons.push("rating_match");
  if (parts.diversity >= 0.9) reasons.push("new_theme");
  if (puzzle.source === "personal") reasons.push("your_mistake");
  if (reasons.length === 0) reasons.push("practice");

  return { puzzle, score: Math.round(score * 100) / 100, parts, reasons };
}

/** Rank a candidate pool; ties break on puzzle id so ordering is stable. */
export function selectPuzzles(
  candidates: readonly PlatformPuzzle[],
  ctx: SelectionContext,
  limit: number,
): ScoredPuzzle[] {
  const scored = candidates.map((p) => scorePuzzle(p, ctx));
  scored.sort((a, b) => (b.score === a.score ? a.puzzle.id.localeCompare(b.puzzle.id) : b.score - a.score));

  // Enforce theme diversity across the returned queue as well.
  const out: ScoredPuzzle[] = [];
  const used = new Map<ThemeKey, number>();
  for (const item of scored) {
    if (out.length >= limit) break;
    const dominant = item.puzzle.themes[0];
    const count = dominant ? (used.get(dominant) ?? 0) : 0;
    if (dominant && count >= Math.max(2, Math.ceil(limit / 3))) continue;
    if (dominant) used.set(dominant, count + 1);
    out.push(item);
  }
  // Backfill when diversity filtering trimmed too much.
  for (const item of scored) {
    if (out.length >= limit) break;
    if (!out.includes(item)) out.push(item);
  }
  return out;
}
