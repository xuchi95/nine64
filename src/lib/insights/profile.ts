/**
 * Aggregates reviewed games into a personal weakness profile, then uses it to
 * bias the bandit that recommends the next training opponent.
 */
import type { SavedGame } from "@/lib/history";
import type { PlyAnalysis } from "@/lib/analysis/types";
import type { GamePhase } from "@/lib/analysis/phase";
import { MOTIF_LABEL, type Motif } from "@/lib/analysis/motifs";
import type { MoveLabel } from "@/lib/analysis/classify";
import { ucb1, type ArmStats } from "@/lib/learn/bandit";
import { BOT_LEVELS, BOT_PERSONALITIES } from "@/config/bots";

export interface PhaseStat {
  phase: GamePhase;
  plies: number;
  avgLoss: number;
  blunders: number;
}

export interface WeaknessProfile {
  reviewedGames: number;
  plies: number;
  phases: PhaseStat[];
  /** Weakest phase (highest average win% loss) with enough samples. */
  weakestPhase: GamePhase | null;
  /** Motifs the player most often failed to spot, most frequent first. */
  missedMotifs: { motif: Motif; label: string; count: number }[];
  labels: Partial<Record<MoveLabel, number>>;
  avgLoss: number;
  brilliants: number;
  estimatedRating: number | null;
  /** Simple linear trend of estimated rating across reviewed games. */
  trend: number;
  forecast: number | null;
}

const EMPTY: WeaknessProfile = {
  reviewedGames: 0,
  plies: 0,
  phases: [],
  weakestPhase: null,
  missedMotifs: [],
  labels: {},
  avgLoss: 0,
  brilliants: 0,
  estimatedRating: null,
  trend: 0,
  forecast: null,
};

function ownPlies(game: SavedGame): PlyAnalysis[] {
  const plies = game.review?.plies;
  if (!plies) return [];
  const side = game.playerColor;
  return side ? plies.filter((p) => p.color === side) : plies;
}

function ratingOf(game: SavedGame): number | null {
  const summary = game.review?.summary;
  if (!summary) return null;
  const side = game.playerColor ?? "w";
  return summary.estimatedRating[side] ?? null;
}

export function buildWeaknessProfile(games: SavedGame[]): WeaknessProfile {
  const reviewed = games.filter((g) => (g.review?.plies?.length ?? 0) > 0);
  if (reviewed.length === 0) return EMPTY;

  const phaseAgg = new Map<GamePhase, { loss: number; n: number; blunders: number }>();
  const motifMiss = new Map<Motif, number>();
  const labels: Partial<Record<MoveLabel, number>> = {};
  let totalLoss = 0;
  let totalPlies = 0;
  let brilliants = 0;

  for (const game of reviewed) {
    for (const ply of ownPlies(game)) {
      totalPlies += 1;
      totalLoss += ply.loss;
      labels[ply.label] = (labels[ply.label] ?? 0) + 1;
      if (ply.label === "brilliant") brilliants += 1;
      const agg = phaseAgg.get(ply.phase) ?? { loss: 0, n: 0, blunders: 0 };
      agg.loss += ply.loss;
      agg.n += 1;
      if (ply.label === "miss") agg.blunders += 1;
      phaseAgg.set(ply.phase, agg);

      // Motifs present in the engine's better alternative that the player missed.
      const missed = ply.label === "miss" || ply.label === "mistake";
      if (missed) {
        for (const motif of ply.motifs) {
          motifMiss.set(motif, (motifMiss.get(motif) ?? 0) + 1);
        }
      }
    }
  }

  const phases: PhaseStat[] = [...phaseAgg.entries()]
    .map(([phase, agg]) => ({
      phase,
      plies: agg.n,
      avgLoss: Math.round((agg.loss / Math.max(1, agg.n)) * 10) / 10,
      blunders: agg.blunders,
    }))
    .sort((a, b) => b.avgLoss - a.avgLoss);

  const eligible = phases.filter((p) => p.plies >= 8);
  const ratings = reviewed
    .map((g) => ({ at: g.playedAt, rating: ratingOf(g) }))
    .filter((r): r is { at: string; rating: number } => r.rating !== null)
    .sort((a, b) => a.at.localeCompare(b.at));

  const trend = linearTrend(ratings.map((r) => r.rating));
  const latest = ratings.at(-1)?.rating ?? null;

  return {
    reviewedGames: reviewed.length,
    plies: totalPlies,
    phases,
    weakestPhase: eligible[0]?.phase ?? phases[0]?.phase ?? null,
    missedMotifs: [...motifMiss.entries()]
      .map(([motif, count]) => ({ motif, label: MOTIF_LABEL[motif], count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    labels,
    avgLoss: Math.round((totalLoss / Math.max(1, totalPlies)) * 10) / 10,
    brilliants,
    estimatedRating: latest,
    trend: Math.round(trend * 10) / 10,
    forecast: latest === null ? null : Math.round(latest + trend * 10),
  };
}

/** Least-squares slope per game of the estimated-rating series. */
function linearTrend(values: number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) ** 2;
  });
  return den === 0 ? 0 : num / den;
}

export interface TrainingArm {
  id: string;
  level: number;
  personalityId: string;
  title: string;
  personalityName: string;
  reason: string;
}

/**
 * Bandit arms: bot levels near the player's estimated strength crossed with
 * personalities that attack the player's weakest phase.
 */
export function recommendTraining(
  profile: WeaknessProfile,
  bandit: Record<string, ArmStats | undefined>,
): TrainingArm | null {
  const target = profile.estimatedRating ?? 1400;
  const candidates = BOT_LEVELS.filter((l) => {
    const elo = l.uciElo ?? 2800;
    return Math.abs(elo - target) <= 400;
  });
  const levels = candidates.length > 0 ? candidates : BOT_LEVELS.slice(3, 8);

  const arms: TrainingArm[] = [];
  for (const level of levels) {
    for (const p of BOT_PERSONALITIES) {
      arms.push({
        id: `${level.level}:${p.id}`,
        level: level.level,
        personalityId: p.id,
        title: level.title,
        personalityName: p.name,
        reason: reasonFor(profile, p.id),
      });
    }
  }

  const ranked = ucb1(arms, bandit, {
    bias: (arm) => phaseBias(profile.weakestPhase, arm.personalityId),
  });
  return ranked[0]?.arm ?? null;
}

function phaseBias(phase: GamePhase | null, personalityId: string): number {
  if (!phase) return 0;
  const map: Record<GamePhase, Record<string, number>> = {
    opening: { gambit: 0.25, viper: 0.2, chaos: 0.15 },
    middlegame: { viper: 0.25, nova: 0.2, gambit: 0.1 },
    endgame: { fortress: 0.3, atlas: 0.2, oracle: 0.15 },
  };
  return map[phase][personalityId] ?? 0;
}

function reasonFor(profile: WeaknessProfile, personalityId: string): string {
  if (!profile.weakestPhase) return "Balanced sparring while your profile builds up.";
  const phase = profile.weakestPhase;
  if (phase === "endgame" && personalityId === "fortress")
    return "Grinds endgames — exactly where you lose the most.";
  if (phase === "middlegame" && (personalityId === "viper" || personalityId === "nova"))
    return "Sharp middlegame pressure to train your weakest phase.";
  if (phase === "opening" && personalityId === "gambit")
    return "Early gambits force you to solve opening problems.";
  return `Targets your ${phase} weakness.`;
}
