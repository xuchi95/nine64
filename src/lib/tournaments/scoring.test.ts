import { describe, expect, it } from "vitest";
import { computeStandings, scorePairing, streakMultiplier } from "./scoring";
import { DEFAULT_ARENA_SCORING, DEFAULT_CLASSICAL_SCORING } from "./types";

describe("streak scoring", () => {
  it("does nothing before the threshold and caps at the maximum", () => {
    expect(streakMultiplier(DEFAULT_ARENA_SCORING, 0)).toBe(1);
    expect(streakMultiplier(DEFAULT_ARENA_SCORING, 1)).toBe(1);
    expect(streakMultiplier(DEFAULT_ARENA_SCORING, 2)).toBe(2);
    expect(streakMultiplier(DEFAULT_ARENA_SCORING, 9)).toBe(2);
    expect(streakMultiplier(DEFAULT_CLASSICAL_SCORING, 9)).toBe(1);
  });

  it("doubles a win once the player is on a streak", () => {
    const [white, black] = scorePairing(DEFAULT_ARENA_SCORING, {
      result: "white",
      whiteId: "a",
      blackId: "b",
      whiteStreak: 2,
      blackStreak: 1,
    });
    expect(white).toMatchObject({ points: 4, basePoints: 2, bonusPoints: 2, streak: 3 });
    expect(black).toMatchObject({ points: 0, streak: 0 });
  });

  it("keeps draws at base points by default", () => {
    const [white] = scorePairing(DEFAULT_ARENA_SCORING, {
      result: "draw",
      whiteId: "a",
      blackId: "b",
      whiteStreak: 5,
    });
    expect(white!.points).toBe(1);
  });

  it("voids both sides", () => {
    const sides = scorePairing(DEFAULT_CLASSICAL_SCORING, {
      result: "void",
      whiteId: "a",
      blackId: "b",
    });
    expect(sides.every((s) => s.points === 0)).toBe(true);
  });
});

describe("standings", () => {
  const players = [
    { userId: "a", rating: 1600, seed: 1 },
    { userId: "b", rating: 1500, seed: 2 },
    { userId: "c", rating: 1400, seed: 3 },
    { userId: "d", rating: 1300, seed: 4 },
  ];

  it("ranks by score then buchholz", () => {
    const pairings = [
      { roundNumber: 1, whiteId: "a", blackId: "b", result: "white" as const, status: "finished" },
      { roundNumber: 1, whiteId: "c", blackId: "d", result: "white" as const, status: "finished" },
      { roundNumber: 2, whiteId: "a", blackId: "c", result: "draw" as const, status: "finished" },
      { roundNumber: 2, whiteId: "b", blackId: "d", result: "white" as const, status: "finished" },
    ];
    const scores = [
      { userId: "a", pairingIndex: 0, points: 1, outcome: "win" as const },
      { userId: "b", pairingIndex: 0, points: 0, outcome: "loss" as const },
      { userId: "c", pairingIndex: 1, points: 1, outcome: "win" as const },
      { userId: "d", pairingIndex: 1, points: 0, outcome: "loss" as const },
      { userId: "a", pairingIndex: 2, points: 0.5, outcome: "draw" as const },
      { userId: "c", pairingIndex: 2, points: 0.5, outcome: "draw" as const },
      { userId: "b", pairingIndex: 3, points: 1, outcome: "win" as const },
      { userId: "d", pairingIndex: 3, points: 0, outcome: "loss" as const },
    ];
    const rows = computeStandings({
      players,
      pairings,
      scores,
      tiebreaks: ["buchholz", "sonneborn_berger"],
    });
    expect(rows.map((r) => r.userId)).toEqual(["a", "c", "b", "d"]);
    expect(rows[0]).toMatchObject({ rank: 1, score: 1.5, wins: 1, draws: 1, gamesPlayed: 2 });
    // a met b (1.0) and c (1.5)
    expect(rows[0]!.tiebreak["buchholz"]).toBe(2.5);
  });

  it("ignores voided pairings so Fair Play recomputes cleanly", () => {
    const rows = computeStandings({
      players: players.slice(0, 2),
      pairings: [
        { roundNumber: 1, whiteId: "a", blackId: "b", result: "void" as const, status: "void" },
      ],
      scores: [],
      tiebreaks: ["buchholz"],
    });
    expect(rows.every((r) => r.score === 0 && r.gamesPlayed === 0)).toBe(true);
  });

  it("tracks colour balance and byes", () => {
    const rows = computeStandings({
      players: players.slice(0, 3),
      pairings: [
        { roundNumber: 1, whiteId: "a", blackId: "b", result: "white" as const, status: "finished" },
        { roundNumber: 1, whiteId: "c", blackId: null, result: "bye" as const, status: "bye" },
      ],
      scores: [
        { userId: "a", pairingIndex: 0, points: 1, outcome: "win" as const },
        { userId: "b", pairingIndex: 0, points: 0, outcome: "loss" as const },
        { userId: "c", pairingIndex: 1, points: 1, outcome: "bye" as const },
      ],
      tiebreaks: ["buchholz"],
    });
    const byId = Object.fromEntries(rows.map((r) => [r.userId, r]));
    expect(byId["a"]!.colourBalance).toBe(1);
    expect(byId["b"]!.colourBalance).toBe(-1);
    expect(byId["c"]).toMatchObject({ byes: 1, gamesPlayed: 0, score: 1 });
  });
});
