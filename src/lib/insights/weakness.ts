import type { SavedGame } from "@/lib/history";
import type { PlyAnalysis } from "@/lib/analysis/types";
import type { GamePhase } from "@/lib/analysis/phase";
import type { Motif } from "@/lib/analysis/motifs";
import { ratingFromAcpl } from "@/lib/analysis/winrate";

export interface WeaknessBucket {
  key: string;
  label: string;
  moves: number;
  avgLoss: number;
  /** 0-100, higher = stronger. */
  score: number;
}

export interface WeaknessProfile {
  phases: WeaknessBucket[];
  motifs: WeaknessBucket[];
  blunderRate: number;
  estimatedRating: number;
  reviewedGames: number;
  totalMoves: number;
  weakest: WeaknessBucket | null;
}

const PHASE_LABEL: Record<GamePhase, string> = {
  opening: "Opening",
  middlegame: "Middlegame",
  endgame: "Endgame",
};

function ownPlies(game: SavedGame): PlyAnalysis[] {
  const plies = game.review?.plies;
  if (!plies) return [];
  const color = game.playerColor;
  return color ? plies.filter((p) => p.color === color) : plies;
}

function bucket(key: string, label: string, plies: PlyAnalysis[]): WeaknessBucket {
  const avgLoss =
    plies.length === 0 ? 0 : plies.reduce((a, p) => a + p.loss, 0) / plies.length;
  return {
    key,
    label,
    moves: plies.length,
    avgLoss: Math.round(avgLoss * 10) / 10,
    score: Math.round(Math.max(0, Math.min(100, 100 - avgLoss * 6))),
  };
}

export function buildWeaknessProfile(games: SavedGame[]): WeaknessProfile {
  const reviewed = games.filter((g) => g.review?.plies?.length);
  const all = reviewed.flatMap(ownPlies);

  const phases = (Object.keys(PHASE_LABEL) as GamePhase[]).map((phase) =>
    bucket(phase, PHASE_LABEL[phase], all.filter((p) => p.phase === phase)),
  );

  const motifKeys: Motif[] = [
    "fork",
    "pin",
    "skewer",
    "discovered",
    "back-rank",
    "hanging",
    "mate-net",
    "promotion",
  ];
  const motifs = motifKeys
    .map((motif) =>
      bucket(
        motif,
        motif.replace(/(^|-)([a-z])/g, (_, sep: string, c: string) => (sep ? " " : "") + c.toUpperCase()),
        all.filter((p) => p.motifs.includes(motif)),
      ),
    )
    .filter((b) => b.moves > 0);

  const blunders = all.filter((p) => p.label === "blunder" || p.label === "miss").length;
  const avgLoss = all.length === 0 ? 0 : all.reduce((a, p) => a + p.loss, 0) / all.length;
  // Rating estimation needs centipawn loss, not win-percentage loss. Older
  // reviews only stored win% loss, so approximate it near equality (1% ≈ 8cp).
  const avgCpLoss =
    all.length === 0
      ? 0
      : all.reduce((a, p) => a + (p.cpLoss ?? p.loss * 8), 0) / all.length;

  const withData = phases.filter((p) => p.moves >= 5);
  const weakest =
    withData.length === 0
      ? null
      : withData.reduce((worst, b) => (b.avgLoss > worst.avgLoss ? b : worst), withData[0]!);

  return {
    phases,
    motifs,
    blunderRate: all.length === 0 ? 0 : Math.round((blunders / all.length) * 1000) / 10,
    estimatedRating: ratingFromAcpl(avgCpLoss),
    reviewedGames: reviewed.length,
    totalMoves: all.length,
    weakest,
  };
}
