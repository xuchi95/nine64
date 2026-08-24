/**
 * Synthetic calibration benchmark.
 *
 * We cannot ship labelled real cheating data, so the model is calibrated against
 * a generator that reproduces the statistical fingerprints we care about:
 * honest players across 800-2400 rating and six cheating archetypes.
 */
import { evaluateGame } from "../evaluate";
import { expectations } from "../expectation";
import type { MoveObservation, TurnTelemetry } from "../types";

/* --------------------------------- rng ---------------------------------- */

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function gauss(rand: () => number, mean: number, sd: number): number {
  const u = Math.max(1e-9, rand());
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ------------------------------- archetypes ------------------------------ */

export type Archetype =
  | "honest"
  | "engine_full"
  | "engine_hard_only"
  | "engine_endgame"
  | "engine_low_depth"
  | "engine_throttled"
  | "engine_no_blur";

export interface SimGame {
  observations: MoveObservation[];
  turns: TurnTelemetry[];
  rating: number;
  archetype: Archetype;
}

interface MoveProfile {
  top1: number;
  lossMean: number;
  lossSd: number;
  blur: boolean;
  fast: boolean;
  direct: number;
}

function honestProfile(rating: number, complexity: number): MoveProfile {
  const exp = expectations(rating);
  // Hard positions are where honest players lose the thread.
  const hardness = complexity >= 0.55 ? 1 : 0;
  const top1 = hardness ? exp.hardMatch.mean : exp.engineMatch.mean + 0.06;
  const lossMean = exp.cplMean.mean * (hardness ? 1.5 : 0.7);
  return { top1, lossMean, lossSd: lossMean * 1.35, blur: false, fast: false, direct: 0.36 };
}

function cheatProfile(top1: number, lossMean: number, flat: number, blur: boolean): MoveProfile {
  return { top1, lossMean, lossSd: lossMean * flat, blur, fast: true, direct: 0.85 };
}

/** Generate one game for a player of a given archetype. */
export function simulateGame(archetype: Archetype, rating: number, seed: number): SimGame {
  const rand = rng(seed);
  const moves = 26 + Math.floor(rand() * 20);
  const observations: MoveObservation[] = [];
  const turns: TurnTelemetry[] = [];
  const baseTime = 4000 + rand() * 6000;

  for (let i = 0; i < moves; i++) {
    const ply = i * 2;
    const complexity = Math.max(0, Math.min(1, gauss(rand, 0.52, 0.2)));
    const phaseLate = i / moves > 0.55;

    let p = honestProfile(rating, complexity);
    const hard = complexity >= 0.55;
    switch (archetype) {
      case "engine_full":
        p = cheatProfile(0.88, 0.9, 0.7, true);
        break;
      case "engine_no_blur":
        // Assisted on a second device: no focus loss at all.
        p = cheatProfile(0.86, 1.1, 0.7, false);
        break;
      case "engine_hard_only":
        if (hard) p = cheatProfile(0.92, 0.7, 0.6, true);
        break;
      case "engine_endgame":
        if (phaseLate) p = cheatProfile(0.9, 0.8, 0.6, true);
        break;
      case "engine_low_depth":
        p = cheatProfile(0.68, 3.2, 0.8, true);
        break;
      case "engine_throttled":
        // Deliberately drops moves to look human, but variance stays machine-flat.
        p = rand() < 0.22 ? { ...cheatProfile(0.1, 9, 0.5, true) } : cheatProfile(0.72, 2.2, 0.55, true);
        break;
      default:
        break;
    }

    const isTop1 = rand() < p.top1;
    const loss = isTop1 ? Math.max(0, gauss(rand, 0.2, 0.3)) : Math.max(0.2, gauss(rand, p.lossMean, p.lossSd));
    const accuracy = Math.max(0, Math.min(100, 100 - loss * 3.2 - gauss(rand, 0, 3)));
    const spentMs = p.fast
      ? Math.max(600, gauss(rand, baseTime * 0.75, baseTime * 0.1))
      : Math.max(400, gauss(rand, hard ? baseTime * 1.7 : baseTime * 0.8, baseTime * 0.75));

    observations.push({
      ply,
      isTop1,
      loss: Math.round(loss * 10) / 10,
      complexity: Math.round(complexity * 1000) / 1000,
      accuracy: Math.round(accuracy * 10) / 10,
      spentMs: Math.round(spentMs),
    });

    const blurring = p.blur && rand() < 0.75;
    turns.push({
      ply,
      spentMs: Math.round(spentMs),
      blurMs: blurring ? Math.round(spentMs * 0.6) : rand() < 0.08 ? 1800 : 0,
      blurCount: blurring ? 1 : 0,
      firstInteractionMs: Math.round(spentMs * (p.fast ? 0.85 : 0.5)),
      directToTarget: rand() < p.direct,
      exploredSquares: rand() < p.direct ? 0 : 1 + Math.floor(rand() * 2),
      pasted: false,
      duplicateTab: false,
    });
  }

  return { observations, turns, rating, archetype };
}

export interface BenchmarkResult {
  recall: number;
  falsePositiveRate: number;
  perArchetype: Record<string, { n: number; detected: number; meanScore: number }>;
}

const CHEATS: Archetype[] = [
  "engine_full",
  "engine_no_blur",
  "engine_hard_only",
  "engine_endgame",
  "engine_low_depth",
  "engine_throttled",
];

/**
 * Runs the whole cohort. A cheat "game" counts as detected when the per-game
 * score reaches the monitoring threshold; the production pipeline additionally
 * requires the SPRT to conclude across games before any hard action.
 */
export function runBenchmark(perGroup = 120, seed = 20260824): BenchmarkResult {
  const ratings = [900, 1200, 1500, 1800, 2100, 2400];
  const perArchetype: BenchmarkResult["perArchetype"] = {};

  const evalGroup = (archetype: Archetype, threshold: number) => {
    let detected = 0;
    let total = 0;
    let sum = 0;
    for (let i = 0; i < perGroup; i++) {
      const rating = ratings[i % ratings.length]!;
      const g = simulateGame(archetype, rating, seed + i * 7919 + archetype.length * 104729);
      const v = evaluateGame({
        observations: g.observations,
        turns: g.turns,
        rating,
      });
      total++;
      sum += v.score;
      if (v.score >= threshold) detected++;
    }
    perArchetype[archetype] = {
      n: total,
      detected,
      meanScore: Math.round((sum / total) * 10) / 10,
    };
    return { detected, total };
  };

  const honest = evalGroup("honest", 40);
  let cheatDetected = 0;
  let cheatTotal = 0;
  for (const a of CHEATS) {
    const r = evalGroup(a, 40);
    cheatDetected += r.detected;
    cheatTotal += r.total;
  }

  return {
    recall: cheatDetected / cheatTotal,
    falsePositiveRate: honest.detected / honest.total,
    perArchetype,
  };
}
