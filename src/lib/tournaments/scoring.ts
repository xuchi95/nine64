/**
 * Nine64 scoring and tie-breaks.
 *
 * The scoring table is configuration, not a hardcoded operator formula: every
 * tournament carries its own `ScoringConfig`, the defaults are documented in
 * `types.ts`, and the streak rule is a plain multiplier on base points.
 */

import type { Outcome, PairingResult, ScoringConfig, StandingRow } from "./types";

export interface ScoredSide {
  userId: string;
  outcome: Outcome;
  basePoints: number;
  bonusPoints: number;
  points: number;
  /** Streak after this game, carried into the next pairing. */
  streak: number;
}

/** Multiplier earned by a player who arrives on `streakBefore` straight wins. */
export function streakMultiplier(config: ScoringConfig, streakBefore: number): number {
  if (!config.streakEnabled || streakBefore < config.streakThreshold) return 1;
  const steps = streakBefore - config.streakThreshold + 1;
  return Math.min(config.streakMax, 1 + steps * config.streakStep);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function scoreOne(
  config: ScoringConfig,
  userId: string,
  outcome: Outcome,
  streakBefore: number,
): ScoredSide {
  if (outcome === "void") {
    return { userId, outcome, basePoints: 0, bonusPoints: 0, points: 0, streak: 0 };
  }
  if (outcome === "bye") {
    return {
      userId,
      outcome,
      basePoints: config.bye,
      bonusPoints: 0,
      points: round2(config.bye),
      streak: streakBefore,
    };
  }
  const base = outcome === "win" ? config.win : outcome === "draw" ? config.draw : config.loss;
  const eligible = outcome === "win" || (outcome === "draw" && config.applyToDraw);
  const multiplier = eligible ? streakMultiplier(config, streakBefore) : 1;
  const total = round2(base * multiplier);
  return {
    userId,
    outcome,
    basePoints: round2(base),
    bonusPoints: round2(total - base),
    points: total,
    streak: outcome === "win" ? streakBefore + 1 : 0,
  };
}

/** Points for both sides of one finished pairing. */
export function scorePairing(
  config: ScoringConfig,
  args: {
    result: PairingResult;
    whiteId: string | null;
    blackId: string | null;
    whiteStreak?: number;
    blackStreak?: number;
  },
): ScoredSide[] {
  const { result, whiteId, blackId } = args;
  if (result === "bye") {
    return whiteId ? [scoreOne(config, whiteId, "bye", args.whiteStreak ?? 0)] : [];
  }
  if (!whiteId || !blackId) return [];
  if (result === "void") {
    return [
      scoreOne(config, whiteId, "void", 0),
      scoreOne(config, blackId, "void", 0),
    ];
  }
  const whiteOutcome: Outcome = result === "white" ? "win" : result === "draw" ? "draw" : "loss";
  const blackOutcome: Outcome = result === "black" ? "win" : result === "draw" ? "draw" : "loss";
  return [
    scoreOne(config, whiteId, whiteOutcome, args.whiteStreak ?? 0),
    scoreOne(config, blackId, blackOutcome, args.blackStreak ?? 0),
  ];
}

export interface StandingsInput {
  players: { userId: string; rating: number; seed: number; eliminatedRound?: number | null }[];
  pairings: {
    roundNumber: number;
    whiteId: string | null;
    blackId: string | null;
    result: PairingResult | null;
    status: string;
  }[];
  scores: { userId: string; pairingIndex: number; points: number; outcome: Outcome }[];
  tiebreaks: readonly string[];
}

/**
 * Rebuild the whole standings table from the score ledger.
 *
 * Recomputing from scratch is what makes Fair Play adjudication safe: voiding
 * a game removes its ledger rows and the next recompute simply produces the
 * corrected table, with no drift from incremental updates.
 */
export function computeStandings(input: StandingsInput): StandingRow[] {
  const acc = new Map<string, StandingRow & { fractions: { opponentId: string; value: number }[] }>();
  for (const p of input.players) {
    acc.set(p.userId, {
      userId: p.userId,
      rank: 0,
      score: 0,
      gamesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      byes: 0,
      streak: 0,
      colourBalance: 0,
      eliminatedRound: p.eliminatedRound ?? null,
      tiebreak: {},
      fractions: [],
    });
  }

  for (const s of input.scores) {
    const row = acc.get(s.userId);
    if (!row) continue;
    row.score = Math.round((row.score + s.points) * 100) / 100;
    if (s.outcome === "win") {
      row.wins += 1;
      row.gamesPlayed += 1;
      row.streak += 1;
    } else if (s.outcome === "draw") {
      row.draws += 1;
      row.gamesPlayed += 1;
      row.streak = 0;
    } else if (s.outcome === "loss") {
      row.losses += 1;
      row.gamesPlayed += 1;
      row.streak = 0;
    } else if (s.outcome === "bye") {
      row.byes += 1;
    }
  }

  for (const p of input.pairings) {
    if (p.status === "void") continue;
    if (p.whiteId) {
      const w = acc.get(p.whiteId);
      if (w && p.blackId) {
        w.colourBalance += 1;
        w.fractions.push({
          opponentId: p.blackId,
          value: p.result === "white" ? 1 : p.result === "draw" ? 0.5 : 0,
        });
      }
    }
    if (p.blackId) {
      const b = acc.get(p.blackId);
      if (b && p.whiteId) {
        b.colourBalance -= 1;
        b.fractions.push({
          opponentId: p.whiteId,
          value: p.result === "black" ? 1 : p.result === "draw" ? 0.5 : 0,
        });
      }
    }
  }

  const wants = new Set(input.tiebreaks);
  for (const row of acc.values()) {
    if (wants.has("buchholz")) {
      row.tiebreak["buchholz"] = round2(
        row.fractions.reduce((sum, f) => sum + (acc.get(f.opponentId)?.score ?? 0), 0),
      );
    }
    if (wants.has("sonneborn_berger")) {
      row.tiebreak["sonneborn_berger"] = round2(
        row.fractions.reduce((sum, f) => sum + (acc.get(f.opponentId)?.score ?? 0) * f.value, 0),
      );
    }
    if (wants.has("wins")) row.tiebreak["wins"] = row.wins;
  }

  const ratingOf = new Map(input.players.map((p) => [p.userId, p.rating]));
  const order = [...acc.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    for (const tb of input.tiebreaks) {
      const av = a.tiebreak[tb] ?? 0;
      const bv = b.tiebreak[tb] ?? 0;
      if (bv !== av) return bv - av;
    }
    const ar = ratingOf.get(a.userId) ?? 0;
    const br = ratingOf.get(b.userId) ?? 0;
    if (br !== ar) return br - ar;
    return a.userId < b.userId ? -1 : 1;
  });

  return order.map(({ fractions: _fractions, ...row }, index) => ({ ...row, rank: index + 1 }));
}
