import test from "node:test";
import assert from "node:assert/strict";
import { toObservations, complexityOf, spentMsFor, winPercent } from "../src/observations.js";
import { runOnce } from "../src/index.js";

const moves = [
  { ply: 1, uci: "e2e4", san: "e4", fen: "", whiteTimeMs: 300000, blackTimeMs: 300000 },
  { ply: 2, uci: "e7e5", san: "e5", fen: "", whiteTimeMs: 300000, blackTimeMs: 300000 },
  { ply: 3, uci: "g1f3", san: "Nf3", fen: "", whiteTimeMs: 295000, blackTimeMs: 300000 },
  { ply: 4, uci: "b8c6", san: "Nc6", fen: "", whiteTimeMs: 295000, blackTimeMs: 291000 },
];

test("win percentage is monotonic and centred", () => {
  assert.equal(Math.round(winPercent(0)), 50);
  assert.ok(winPercent(200) > winPercent(0));
  assert.ok(winPercent(-200) < winPercent(0));
});

test("complexity stays inside 0..1", () => {
  assert.equal(complexityOf(0, 1), 0);
  assert.ok(complexityOf(1000, 60) <= 1);
});

test("observations are derived per colour with bounded loss", () => {
  const plies = [
    { ply: 1, color: "w", bestCp: 30, playedCp: 30, isTop1: true, legalMoves: 20, spread: 40, spentMs: null },
    { ply: 2, color: "b", bestCp: 20, playedCp: -300, isTop1: false, legalMoves: 25, spread: 10, spentMs: null },
  ];
  const white = toObservations(plies, "w");
  const black = toObservations(plies, "b");
  assert.equal(white.length, 1);
  assert.equal(white[0].isTop1, true);
  assert.equal(white[0].loss, 0);
  assert.ok(black[0].loss > 20);
  assert.ok(black[0].accuracy < 100);
});

test("time spent comes from canonical clock deltas", () => {
  assert.equal(spentMsFor(moves, 1, "w"), 5000);
  assert.equal(spentMsFor(moves, 1, "b"), 9000);
  assert.equal(spentMsFor(moves, 0, "w"), null);
});

function fakeApi(jobs) {
  const calls = { result: [], fail: [] };
  let served = false;
  return {
    calls,
    claim: async () => (served ? { jobs: [] } : ((served = true), { jobs })),
    result: async (p) => calls.result.push(p),
    fail: async (jobId, error) => calls.fail.push({ jobId, error }),
  };
}

// A legal 20-ply knight shuffle so the canonical replay succeeds.
const cycle = ["g1f3", "g8f6", "f3g1", "f6g8"];
const longGame = Array.from({ length: 20 }, (_, i) => ({
  ply: i + 1,
  uci: cycle[i % 4],
  san: cycle[i % 4],
  fen: "",
  whiteTimeMs: 300000 - i * 100,
  blackTimeMs: 300000 - i * 100,
}));

const engine = {
  version: "stockfish-test",
  analyse: async () => ({ lines: [{ move: "g1f3", cp: 20 }] }),
};

test("short games are failed, never scored", async () => {
  const api = fakeApi([
    { jobId: "j1", game: { whiteId: "w", blackId: "b", initialFen: undefined }, moves: moves },
  ]);
  await runOnce(api, engine);
  assert.equal(api.calls.result.length, 0);
  assert.equal(api.calls.fail[0].error, "TOO_FEW_MOVES");
});

test("a job produces one result payload per player and is retry safe", async () => {
  const job = {
    jobId: "j2",
    game: { whiteId: "w", blackId: "b", initialFen: undefined },
    moves: longGame,
  };
  const api = fakeApi([job]);
  await runOnce(api, engine);
  const api2 = fakeApi([job]);
  await runOnce(api2, engine);

  assert.equal(api.calls.result.length, 1);
  assert.equal(api.calls.result[0].jobId, "j2");
  assert.equal(api.calls.result[0].engineVersion, "stockfish-test");
  assert.deepEqual(
    api.calls.result[0].subjects.map((s) => s.userId),
    ["w", "b"],
  );
  // Same input -> same job id and same subject set: the app upserts one verdict.
  assert.deepEqual(
    api2.calls.result[0].subjects.map((s) => s.userId),
    api.calls.result[0].subjects.map((s) => s.userId),
  );
});

test("engine failures mark the job failed instead of writing evidence", async () => {
  const api = fakeApi([
    { jobId: "j3", game: { whiteId: "w", blackId: "b", initialFen: undefined }, moves: longGame },
  ]);
  await runOnce(api, {
    version: "x",
    analyse: async () => {
      throw new Error("engine crashed");
    },
  });
  assert.equal(api.calls.result.length, 0);
  assert.equal(api.calls.fail[0].jobId, "j3");
});
