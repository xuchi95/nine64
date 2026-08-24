import { describe, expect, it } from "vitest";
import { engineSignals } from "../engineProfile";
import { behaviourSignals } from "../signals";
import { detectSegment } from "../segments";
import { scoreFeatures, confidenceFor } from "../model";
import { sprt } from "../sprt";
import { detectCollusion, type GameRecord } from "../collusion";
import { actionForScore, THRESHOLDS } from "../thresholds";
import { evaluateGame } from "../evaluate";
import type { FairplayFeatures, MoveObservation, TurnTelemetry } from "../types";
import { runBenchmark, simulateGame } from "./benchmark";

function obs(partial: Partial<MoveObservation> & { ply: number }): MoveObservation {
  return {
    isTop1: false,
    loss: 5,
    complexity: 0.5,
    accuracy: 80,
    spentMs: 4000,
    ...partial,
  };
}

function turn(partial: Partial<TurnTelemetry> & { ply: number }): TurnTelemetry {
  return {
    spentMs: 4000,
    blurMs: 0,
    blurCount: 0,
    firstInteractionMs: 2000,
    directToTarget: false,
    exploredSquares: 1,
    pasted: false,
    duplicateTab: false,
    ...partial,
  };
}

const baseFeatures: FairplayFeatures = {
  moves: 40,
  hardMoves: 20,
  blurTurns: 0,
  rating: 1500,
  engineMatch: 0.38,
  hardMatch: 0.26,
  hardAccuracy: 63,
  cplMean: 7,
  cplCv: 1.35,
  timeCv: 0.72,
  hardFastShare: 0.42,
  blurShare: 0.05,
  blurMatchLift: 0,
  noHesitationShare: 0.35,
  pasteCount: 0,
  duplicateTabCount: 0,
  segmentZ: 0,
};

describe("engineSignals", () => {
  it("separates hard-position agreement from overall agreement", () => {
    const observations = [
      obs({ ply: 0, isTop1: true, complexity: 0.2, loss: 0 }),
      obs({ ply: 2, isTop1: true, complexity: 0.2, loss: 0 }),
      obs({ ply: 4, isTop1: false, complexity: 0.9, loss: 12 }),
      obs({ ply: 6, isTop1: true, complexity: 0.9, loss: 0, accuracy: 99 }),
    ];
    const s = engineSignals(observations);
    expect(s.moves).toBe(4);
    expect(s.hardMoves).toBe(2);
    expect(s.engineMatch).toBeCloseTo(0.75, 3);
    expect(s.hardMatch).toBeCloseTo(0.5, 3);
  });

  it("reports a flat quality profile with a low coefficient of variation", () => {
    const flat = Array.from({ length: 20 }, (_, i) => obs({ ply: i * 2, loss: 1 }));
    const human = Array.from({ length: 20 }, (_, i) => obs({ ply: i * 2, loss: i % 5 === 0 ? 30 : 1 }));
    expect(engineSignals(flat).cplCv).toBeLessThan(engineSignals(human).cplCv);
  });
});

describe("behaviourSignals", () => {
  it("measures the accuracy lift that follows leaving the tab", () => {
    const turns: TurnTelemetry[] = [];
    const observations: MoveObservation[] = [];
    for (let i = 0; i < 20; i++) {
      const blurred = i % 2 === 0;
      turns.push(turn({ ply: i * 2, blurMs: blurred ? 5000 : 0 }));
      observations.push(obs({ ply: i * 2, isTop1: blurred }));
    }
    const s = behaviourSignals(turns, observations);
    expect(s.blurTurns).toBe(10);
    expect(s.blurMatchLift).toBeGreaterThan(0.4);
  });

  it("ignores a blur lift measured on too few turns", () => {
    const turns = [turn({ ply: 0, blurMs: 4000 }), turn({ ply: 2, blurMs: 4000 })];
    const observations = [obs({ ply: 0, isTop1: true }), obs({ ply: 2, isTop1: true })];
    expect(behaviourSignals(turns, observations).blurMatchLift).toBe(0);
  });

  it("counts pastes and duplicate tabs", () => {
    const s = behaviourSignals(
      [turn({ ply: 0, pasted: true }), turn({ ply: 2, duplicateTab: true })],
      [],
    );
    expect(s.pasteCount).toBe(1);
    expect(s.duplicateTabCount).toBe(1);
  });
});

describe("detectSegment", () => {
  it("flags an engine window switched on mid-game", () => {
    const observations = [
      ...Array.from({ length: 14 }, (_, i) => obs({ ply: i * 2, isTop1: i % 5 === 0 })),
      ...Array.from({ length: 14 }, (_, i) => obs({ ply: 28 + i * 2, isTop1: true })),
    ];
    const seg = detectSegment(observations);
    expect(seg.z).toBeGreaterThan(1.5);
    expect(seg.windowMatch).toBeGreaterThan(seg.restMatch);
  });

  it("does not flag a uniform game", () => {
    const observations = Array.from({ length: 30 }, (_, i) => obs({ ply: i * 2, isTop1: i % 3 === 0 }));
    expect(detectSegment(observations).z).toBeLessThan(1.25);
  });
});

describe("model", () => {
  it("keeps a typical player for their rating near zero", () => {
    expect(scoreFeatures(baseFeatures).score).toBeLessThan(THRESHOLDS.monitor);
  });

  it("never punishes a player who is worse than expected", () => {
    const weak = scoreFeatures({ ...baseFeatures, engineMatch: 0.1, hardAccuracy: 30, cplMean: 20 });
    expect(weak.score).toBeLessThan(THRESHOLDS.monitor);
  });

  it("scores an engine-like profile high and explains why", () => {
    const v = scoreFeatures({
      ...baseFeatures,
      blurTurns: 24,
      engineMatch: 0.9,
      hardMatch: 0.92,
      hardAccuracy: 97,
      cplMean: 0.6,
      cplCv: 0.5,
      timeCv: 0.15,
      blurShare: 0.7,
      blurMatchLift: 0.4,
      noHesitationShare: 0.9,
      segmentZ: 2,
    });
    expect(v.score).toBeGreaterThanOrEqual(THRESHOLDS.hold);
    expect(v.action).toBe("rating_hold");
    expect(v.reasons.length).toBeGreaterThan(2);
  });

  it("refuses to judge a very short sample", () => {
    const v = scoreFeatures({ ...baseFeatures, moves: 8, engineMatch: 1, hardMatch: 1, cplMean: 0 });
    expect(v.action).toBe("none");
    expect(v.score).toBeLessThan(THRESHOLDS.monitor);
    expect(confidenceFor(8)).toBeLessThan(confidenceFor(40));
  });
});

describe("thresholds", () => {
  it("maps scores to escalating actions", () => {
    expect(actionForScore(10)).toBe("none");
    expect(actionForScore(45)).toBe("monitor");
    expect(actionForScore(75)).toBe("unrated");
    expect(actionForScore(92)).toBe("rating_hold");
  });
});

describe("sprt", () => {
  it("stays undecided after a single suspicious game", () => {
    expect(sprt([0.8]).decision).toBe("undecided");
  });

  it("concludes assisted after a streak", () => {
    expect(sprt([0.9, 0.92, 0.88, 0.95, 0.9]).decision).toBe("assisted");
  });

  it("clears an honest streak", () => {
    expect(sprt(Array.from({ length: 12 }, () => 0.05)).decision).toBe("honest");
  });
});

describe("collusion", () => {
  const rec = (partial: Partial<GameRecord> & { gameId: string }): GameRecord => ({
    opponentId: "opp",
    score: 1,
    moves: 30,
    cplMean: 6,
    ratingBefore: 1500,
    opponentRating: 1500,
    durationMs: 300_000,
    playedAt: new Date().toISOString(),
    ...partial,
  });

  it("detects rating farming against one partner", () => {
    const games = Array.from({ length: 8 }, (_, i) =>
      rec({ gameId: `g${i}`, opponentId: "partner", score: 1, moves: 10, durationMs: 30_000 }),
    );
    const r = detectCollusion(games);
    expect(r.boostingScore).toBeGreaterThanOrEqual(60);
    expect(r.partnerId).toBe("partner");
  });

  it("detects sandbagging through instant, sloppy losses", () => {
    const games = [
      ...Array.from({ length: 4 }, (_, i) => rec({ gameId: `w${i}`, score: 1, cplMean: 3 })),
      ...Array.from({ length: 4 }, (_, i) =>
        rec({ gameId: `l${i}`, score: 0, cplMean: 22, moves: 12, durationMs: 25_000 }),
      ),
    ];
    expect(detectCollusion(games).sandbaggingScore).toBeGreaterThanOrEqual(60);
  });

  it("leaves a normal spread of opponents alone", () => {
    const games = Array.from({ length: 10 }, (_, i) =>
      rec({ gameId: `g${i}`, opponentId: `o${i}`, score: i % 2 === 0 ? 1 : 0, cplMean: 6 + (i % 3) }),
    );
    const r = detectCollusion(games);
    expect(r.boostingScore).toBeLessThan(60);
    expect(r.sandbaggingScore).toBeLessThan(60);
  });
});

describe("evaluateGame", () => {
  it("produces a verdict from a simulated cheating game", () => {
    const g = simulateGame("engine_full", 1200, 12345);
    const v = evaluateGame({ observations: g.observations, turns: g.turns, rating: 1200 });
    expect(v.score).toBeGreaterThan(THRESHOLDS.unrated);
    expect(v.features.moves).toBe(g.observations.length);
  });

  it("leaves a simulated honest game alone", () => {
    const g = simulateGame("honest", 1500, 999);
    const v = evaluateGame({ observations: g.observations, turns: g.turns, rating: 1500 });
    expect(v.score).toBeLessThan(THRESHOLDS.monitor);
  });
});

describe("benchmark", () => {
  it("detects at least 95% of cheating games with under 2% false positives", () => {
    const r = runBenchmark(120);
    // eslint-disable-next-line no-console
    console.table(r.perArchetype);
    // eslint-disable-next-line no-console
    console.log(
      `recall=${(r.recall * 100).toFixed(1)}% fpr=${(r.falsePositiveRate * 100).toFixed(2)}%`,
    );
    expect(r.recall).toBeGreaterThanOrEqual(0.95);
    expect(r.falsePositiveRate).toBeLessThanOrEqual(0.02);
  }, 60_000);
});
