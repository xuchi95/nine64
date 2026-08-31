import { Chess } from "chess.js";
import type { SavedGame } from "@/lib/history";
import { detectMotifs, type Motif } from "@/lib/analysis/motifs";
import type { Motif as MotifType } from "@/lib/analysis/motifs";
import { initialState, type SrsState } from "./fsrs";

/** One ply of a puzzle solution. Even indices are the solver, odd the opponent. */
export interface PuzzleMove {
  uci: string;
  san: string;
}

export interface Puzzle {
  id: string;
  /** Position the player must solve (they are to move). */
  fen: string;
  /**
   * Full principal solution, alternating solver / forced reply. Index 0 is the
   * solver's first move; the puzzle is finished after the last solver move.
   */
  solution: PuzzleMove[];
  /**
   * Extra accepted solver moves per solution ply (UCI), used when several moves
   * win by a near-identical margin.
   */
  alternates: Record<number, string[]>;
  solutionSan: string | null;
  /** Colour the solver plays. */
  color: "w" | "b";
  themes: MotifType[];
  rating: number;
  /** Source game and ply, so the puzzle can link back. */
  gameId: string;
  ply: number;
  /** Win-percentage the player threw away here. */
  swing: number;
  createdAt: string;
  srs: SrsState;
  attempts: number;
  solved: number;
}

const SWING_THRESHOLD = 25;
/** Longest solution we present, always ending on a solver move. */
const MAX_SOLUTION_PLIES = 7;
/** Centipawn window inside which an alternative first move is also accepted. */
const ALTERNATE_CP_WINDOW = 30;

function ratingFor(swing: number, complexity: number): number {
  // Harder positions (high complexity) and smaller swings rate higher.
  const base = 900 + complexity * 1300;
  const swingPenalty = Math.min(300, (swing - SWING_THRESHOLD) * 4);
  return Math.round(Math.max(600, Math.min(2600, base - swingPenalty)) / 10) * 10;
}

export function uciOf(move: { from: string; to: string; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

/** Replay a SAN line from `fen` and return the canonical {uci, san} plies. */
export function lineFromSan(fen: string, sanLine: string[], maxPlies: number): PuzzleMove[] {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return [];
  }
  const out: PuzzleMove[] = [];
  for (const san of sanLine.slice(0, maxPlies)) {
    try {
      const applied = chess.move(san);
      if (!applied) break;
      out.push({ uci: uciOf(applied), san: applied.san });
    } catch {
      break;
    }
  }
  return out;
}

/** Trim to an odd length so the solver always plays the final move. */
function endOnSolverMove(line: PuzzleMove[]): PuzzleMove[] {
  const trimmed = line.slice(0, MAX_SOLUTION_PLIES);
  return trimmed.length % 2 === 0 ? trimmed.slice(0, -1) : trimmed;
}

/**
 * Generates "you missed this" puzzles from a reviewed game: positions where the
 * player lost at least 25 win% and a clearly best continuation existed. The
 * solution keeps the whole principal variation, so a solver only scores when
 * the full tactic is played out, not just the first move.
 */
export function generatePuzzles(game: SavedGame): Puzzle[] {
  const plies = game.review?.plies;
  if (!plies || plies.length === 0) return [];
  const perspective = game.playerColor;
  const out: Puzzle[] = [];

  for (const ply of plies) {
    if (perspective && ply.color !== perspective) continue;
    if (!ply.bestUci || ply.bestUci.slice(0, 4) === ply.uci) continue;
    if (ply.loss < SWING_THRESHOLD) continue;

    let chess: Chess;
    try {
      chess = new Chess(ply.fenBefore);
    } catch {
      continue;
    }
    const from = ply.bestUci.slice(0, 2);
    const to = ply.bestUci.slice(2, 4);
    const promotion = ply.bestUci.length > 4 ? ply.bestUci[4] : undefined;
    let firstSan: string | null = null;
    try {
      const applied = chess.move({ from, to, promotion: promotion ?? "q" });
      firstSan = applied?.san ?? null;
    } catch {
      continue;
    }
    if (!firstSan) continue;

    const best = ply.variations?.[0];
    const deepLine =
      best && best.pvSan.length > 0 ? lineFromSan(ply.fenBefore, best.pvSan, MAX_SOLUTION_PLIES) : [];
    const solution: PuzzleMove[] =
      deepLine.length > 0 && deepLine[0]?.uci.slice(0, 4) === `${from}${to}`
        ? endOnSolverMove(deepLine)
        : [{ uci: `${from}${to}${promotion ?? ""}`, san: firstSan }];

    // Alternative first moves that win by an essentially identical margin.
    const alternates: Record<number, string[]> = {};
    const bestCp = best?.cp ?? null;
    const altFirst = (ply.variations ?? [])
      .slice(1)
      .filter((v) => {
        if (v.mateIn !== null && best?.mateIn !== null) return true;
        if (bestCp === null || v.cp === null) return false;
        return Math.abs(v.cp - bestCp) <= ALTERNATE_CP_WINDOW;
      })
      .map((v) => v.uci)
      .filter((uci) => uci.slice(0, 4) !== `${from}${to}`);
    if (altFirst.length > 0) alternates[0] = [...new Set(altFirst)];

    const themes = detectMotifs({
      fenBefore: ply.fenBefore,
      fenAfter: chess.fen(),
      from,
      to,
      san: firstSan,
    }).map((m) => m.motif);

    out.push({
      id: `${game.id}:${ply.index}`,
      fen: ply.fenBefore,
      solution,
      alternates,
      solutionSan: firstSan,
      color: ply.color,
      themes: dedupe(themes),
      rating: ratingFor(ply.loss, ply.complexity),
      gameId: game.id,
      ply: ply.index,
      swing: ply.loss,
      createdAt: new Date().toISOString(),
      srs: initialState(),
      attempts: 0,
      solved: 0,
    });
  }
  return out;
}

function dedupe(motifs: Motif[]): Motif[] {
  return [...new Set(motifs)];
}

/**
 * Bring puzzles stored before the multi-move solution format (a bare UCI
 * string) into the current shape. Never throws: unusable rows are dropped by
 * the caller when `solution` ends up empty.
 */
export function normalisePuzzle(raw: unknown): Puzzle | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const fen = typeof p["fen"] === "string" ? p["fen"] : null;
  if (!fen) return null;

  let solution: PuzzleMove[] = [];
  const rawSolution = p["solution"];
  if (Array.isArray(rawSolution)) {
    solution = rawSolution
      .filter((m): m is PuzzleMove => !!m && typeof (m as PuzzleMove).uci === "string")
      .map((m) => ({ uci: m.uci, san: typeof m.san === "string" ? m.san : m.uci }));
  } else if (typeof rawSolution === "string" && rawSolution.length >= 4) {
    const san = typeof p["solutionSan"] === "string" ? p["solutionSan"] : rawSolution;
    solution = [{ uci: rawSolution, san }];
  }
  if (solution.length === 0) return null;

  return {
    id: String(p["id"] ?? `${fen}:0`),
    fen,
    solution,
    alternates: (p["alternates"] as Record<number, string[]>) ?? {},
    solutionSan: (p["solutionSan"] as string | null) ?? solution[0]?.san ?? null,
    color: p["color"] === "b" ? "b" : "w",
    themes: (p["themes"] as MotifType[]) ?? [],
    rating: Number(p["rating"] ?? 1200),
    gameId: String(p["gameId"] ?? p["source_game_id"] ?? ""),
    ply: Number(p["ply"] ?? 0),
    swing: Number(p["swing"] ?? 0),
    createdAt: String(p["createdAt"] ?? p["created_at"] ?? new Date().toISOString()),
    srs: (p["srs"] as SrsState) ?? initialState(),
    attempts: Number(p["attempts"] ?? 0),
    solved: Number(p["solved"] ?? 0),
  };
}

export function generateFromLibrary(games: SavedGame[]): Puzzle[] {
  return games.flatMap(generatePuzzles);
}
