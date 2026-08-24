import { Chess } from "chess.js";
import type { SavedGame } from "@/lib/history";
import { detectMotifs, type Motif } from "@/lib/analysis/motifs";
import type { Motif as MotifType } from "@/lib/analysis/motifs";
import { initialState, type SrsState } from "./fsrs";

export interface Puzzle {
  id: string;
  /** Position the player must solve (they are to move). */
  fen: string;
  /** Expected first move in uci. */
  solution: string;
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

function ratingFor(swing: number, complexity: number): number {
  // Harder positions (high complexity) and smaller swings rate higher.
  const base = 900 + complexity * 1300;
  const swingPenalty = Math.min(300, (swing - SWING_THRESHOLD) * 4);
  return Math.round(Math.max(600, Math.min(2600, base - swingPenalty)) / 10) * 10;
}

/**
 * Generates "you missed this" puzzles from a reviewed game: positions where the
 * player lost at least 25 win% and a single clearly best move existed.
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
    let solutionSan: string | null = null;
    try {
      const applied = chess.move({ from, to, promotion: promotion ?? "q" });
      solutionSan = applied?.san ?? null;
    } catch {
      continue;
    }
    const themes = detectMotifs({
      fenBefore: ply.fenBefore,
      fenAfter: chess.fen(),
      from,
      to,
      san: solutionSan ?? "",
    }).map((m) => m.motif);

    out.push({
      id: `${game.id}:${ply.index}`,
      fen: ply.fenBefore,
      solution: `${from}${to}${promotion ?? ""}`,
      solutionSan,
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

export function generateFromLibrary(games: SavedGame[]): Puzzle[] {
  return games.flatMap(generatePuzzles);
}
