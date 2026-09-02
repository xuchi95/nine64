import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeOptions, buildGoArgs, healthPayload } from "../src/index.js";
import { verifyIdToken } from "../src/auth.js";

test("sanitizeOptions drops anything outside the allowlist", () => {
  const out = sanitizeOptions({
    Threads: 8,
    Hash: 2048,
    "Skill Level": 20,
    UCI_LimitStrength: false,
    Debug: "on",
    "Some Raw Command": "quit",
  });
  assert.deepEqual(out, {
    Threads: "8",
    Hash: "2048",
    "Skill Level": "20",
    UCI_LimitStrength: "false",
  });
});

test("buildGoArgs prefers real clock over fixed movetime", () => {
  const args = buildGoArgs({
    clock: { whiteMs: 300000, blackMs: 290000, whiteIncMs: 2000, blackIncMs: 2000 },
  });
  assert.equal(args, "wtime 300000 btime 290000 winc 2000 binc 2000");
});

test("buildGoArgs clamps movetime when no clock is given", () => {
  assert.equal(buildGoArgs({ movetimeMs: 10 }), "movetime 50");
  assert.equal(buildGoArgs({ movetimeMs: 999999 }), "movetime 60000");
});

test("auth fails closed when audience/allowlist are unset", async () => {
  delete process.env.PLAY_ENGINE_AUDIENCE;
  delete process.env.ALLOWED_SERVICE_ACCOUNTS;
  const res = await verifyIdToken("Bearer whatever");
  assert.deepEqual(res, { ok: false, error: "not_configured" });
});

test("auth rejects a missing bearer token", async () => {
  process.env.PLAY_ENGINE_AUDIENCE = "https://engine.example";
  process.env.ALLOWED_SERVICE_ACCOUNTS = "backend@example.iam.gserviceaccount.com";
  const res = await verifyIdToken(undefined);
  assert.deepEqual(res, { ok: false, error: "missing_token" });
});

test("healthPayload reports a healthy pool with real busy counts", () => {
  const pool = {
    size: 2,
    engines: [{ busy: false, dead: false, version: "Stockfish 18" }, { busy: true, dead: false }],
    stats: { searches: 3, timeouts: 0, restarts: 1, illegal: 0 },
    get engineVersion() {
      return "Stockfish 18";
    },
  };
  const out = healthPayload(pool, true);
  assert.equal(out.status, "ok");
  assert.equal(out.engineVersion, "Stockfish 18");
  assert.equal(typeof out.arch, "string");
  assert.deepEqual(out.pool, { size: 2, busy: 1 });
  assert.deepEqual(out.stats, { searches: 3, timeouts: 0, restarts: 1, illegal: 0, hardStops: 0 });
});

test("healthPayload reports starting before the pool is ready and never leaks env", () => {
  const out = healthPayload({ size: 1, engines: [], stats: {} }, false);
  assert.equal(out.status, "starting");
  assert.deepEqual(out.stats, { searches: 0, timeouts: 0, restarts: 0, illegal: 0, hardStops: 0 });
  const serialized = JSON.stringify(out);
  assert.ok(!/PLAY_ENGINE|PRIVATE KEY|Bearer/i.test(serialized));
});

test("buildGoArgs reads the nested search block sent by the backend", () => {
  assert.equal(buildGoArgs({ search: { policy: "depth", depth: 22 } }), "depth 22");
  assert.equal(buildGoArgs({ search: { policy: "nodes", nodes: 500000 } }), "nodes 500000");
  assert.equal(buildGoArgs({ search: { policy: "movetime", movetimeMs: 12000 } }), "movetime 12000");
  assert.equal(
    buildGoArgs({ search: { policy: "clock", wtimeMs: 60000, btimeMs: 45000, wincMs: 2000, bincMs: 2000 } }),
    "wtime 60000 btime 45000 winc 2000 binc 2000",
  );
  assert.equal(buildGoArgs({}), "movetime 3000");
});

// ---------------------------------------------------------------------------
// Benchmark result model
// ---------------------------------------------------------------------------
import {
  EPD_SUITE,
  POSITION_SUITE,
  validateSuite,
  evaluatePosition,
  summarize,
  runSuite,
  suiteMovetime,
  classifyEngineError,
} from "../src/benchmark.js";
import { handleBenchmark } from "../src/index.js";

const mateEntry = EPD_SUITE[0]; // 6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1, mate = a1a8

function run(kind, suite, outcomes) {
  let i = 0;
  return runSuite({
    kind,
    suite,
    movetimeMs: 100,
    engineVersion: "Stockfish 18",
    search: async () => {
      const outcome = outcomes[i++];
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  });
}

test("timeout is never counted as an illegal move", async () => {
  const out = await run("epd", [mateEntry], [new Error("timeout")]);
  assert.equal(out.detail.timeouts, 1);
  assert.equal(out.detail.illegalMoves, 0);
  assert.equal(out.passed, false);
  assert.ok(out.detail.failureReasons.includes("timeout"));
});

test("engine error is never counted as an illegal move", async () => {
  const out = await run("epd", [mateEntry], [new Error("pool_busy")]);
  assert.equal(out.detail.engineErrors, 1);
  assert.equal(out.detail.illegalMoves, 0);
  assert.ok(out.detail.failureReasons.includes("engine_error"));
});

test("missing bestmove is counted as noMove, not illegal", async () => {
  const out = await run("epd", [mateEntry], [{ bestmove: null, depth: 4 }]);
  assert.equal(out.detail.noMove, 1);
  assert.equal(out.detail.illegalMoves, 0);
  assert.ok(out.detail.failureReasons.includes("no_move"));
});

test("an actually illegal UCI move increments illegalMoves", () => {
  const row = evaluatePosition(mateEntry, { ok: true, result: { bestmove: "g1g4", depth: 9 } });
  assert.equal(row.legal, false);
  assert.equal(row.errorCode, "illegal_move");
  const out = summarize("epd", [row], "Stockfish 18");
  assert.equal(out.detail.illegalMoves, 1);
});

test("a legal but non-tactical move is legal-not-solved, never illegal", () => {
  const row = evaluatePosition(mateEntry, { ok: true, result: { bestmove: "a1a7", depth: 12 } });
  assert.equal(row.legal, true);
  assert.equal(row.solved, false);
  const alt = evaluatePosition(EPD_SUITE[11], { ok: true, result: { bestmove: "c3b3", depth: 8 } });
  assert.equal(alt.solved, true, "any move in acceptableMoves counts as solved");
});

test("positions suite passes when every returned move is legal", async () => {
  const outcomes = [
    { bestmove: "e2e4", depth: 12, nodes: 1000, nps: 5000, timeMs: 120 },
    { bestmove: "e1g1", depth: 14 },
    { bestmove: "e3d3", depth: 20 },
    { bestmove: "e1g1", depth: 15 },
    { bestmove: "b4b1", depth: 18 },
    { bestmove: "e2e4", depth: 22 },
    { bestmove: "e6e7", depth: 19 },
    { bestmove: "f6e7", depth: 21 },
    { bestmove: "e2e4", depth: 16 },
    { bestmove: "e2e4", depth: 16 },
  ];
  const out = await run("positions", POSITION_SUITE, outcomes);
  assert.equal(out.detail.legalMoves, POSITION_SUITE.length);
  assert.equal(out.detail.illegalMoves, 0);
  assert.equal(out.passed, true);
  assert.equal(out.depth, 22, "depth is the max real depth reached");
});

test("EPD passes only at >=80% solved with zero execution failures", async () => {
  const solveAll = EPD_SUITE.map((e) => ({ bestmove: e.acceptableMoves[0], depth: 20 }));
  const perfect = await run("epd", EPD_SUITE, solveAll);
  assert.equal(perfect.passed, true);
  assert.equal(perfect.score, 1);

  const missed = solveAll.slice();
  missed[0] = { bestmove: "a1a7", depth: 20 }; // legal, not the mate
  missed[1] = { bestmove: "f3f4", depth: 20 };
  missed[2] = { bestmove: "c1c7", depth: 20 };
  const weak = await run("epd", EPD_SUITE, missed);
  assert.ok(weak.score < 0.8);
  assert.equal(weak.passed, false);
  assert.ok(weak.detail.failureReasons.includes("tactics_score"));
  assert.equal(weak.detail.illegalMoves, 0);
});

test("unknown benchmark kind returns a typed 400", async () => {
  const out = await handleBenchmark({ kind: "selfplay" });
  assert.equal(out.status, 400);
  assert.equal(out.payload.error, "unknown_kind");
});

test("every benchmark FEN and expected move is valid and legal", () => {
  assert.deepEqual(validateSuite(EPD_SUITE), []);
  assert.deepEqual(validateSuite(POSITION_SUITE), []);
  assert.ok(EPD_SUITE.length >= 8);
});

test("suite movetime defaults per kind and clamps", () => {
  assert.equal(suiteMovetime("epd", undefined), 3000);
  assert.equal(suiteMovetime("positions", undefined), 1500);
  assert.equal(suiteMovetime("epd", 99999), 10_000);
  assert.equal(classifyEngineError(new Error("engine_exit")), "engine_error");
  assert.equal(classifyEngineError(new Error("timeout")), "timeout");
});

// ---------------------------------------------------------------------------
// Titan v6: native time management, resource fit, Syzygy and suite identity.
// ---------------------------------------------------------------------------
import { hardStopFor, resourceMismatch, syzygyOptions } from "../src/index.js";
import { capabilities, inspectSyzygy, recommendedHashMb, maxSafeHashMb } from "../src/capabilities.js";
import { BENCHMARK_SUITE_VERSION, POSITION_SUITE as SUITE_960 } from "../src/benchmark.js";

test("clock mode never appends movetime, even with a max move time cap", () => {
  const body = {
    search: { policy: "clock", wtimeMs: 60000, btimeMs: 60000, wincMs: 0, bincMs: 0, maxMoveTimeMs: 30000 },
  };
  const args = buildGoArgs(body);
  assert.equal(args, "wtime 60000 btime 60000");
  assert.ok(!args.includes("movetime"), "Stockfish must manage its own clock");
  assert.equal(hardStopFor(body), 30000, "the cap becomes an outer hard stop instead");
});

test("untimed play still uses an explicit 12s movetime and has no hard stop", () => {
  const body = { search: { policy: "movetime", movetimeMs: 12000, maxMoveTimeMs: 30000 } };
  assert.equal(buildGoArgs(body), "movetime 12000");
  assert.equal(hardStopFor(body), null);
});

test("SyzygyPath can never be set by a caller", () => {
  const out = sanitizeOptions({ SyzygyPath: "/etc", SyzygyProbeLimit: 6 });
  assert.deepEqual(out, { SyzygyProbeLimit: "6" });
});

test("Syzygy options are only injected when real tablebase files exist", () => {
  assert.deepEqual(syzygyOptions({ SyzygyProbeLimit: "6" }, { ready: false, pieces: 0 }, null), {});
  assert.deepEqual(syzygyOptions({}, { ready: true, pieces: 6 }, "/tb"), {}, "no probing requested");
  assert.deepEqual(
    syzygyOptions({ SyzygyProbeLimit: "7" }, { ready: true, pieces: 5 }, "/tb"),
    { SyzygyPath: "/tb", SyzygyProbeLimit: "5" },
    "never advertise more pieces than are installed",
  );
});

test("inspectSyzygy fails closed when nothing is configured", () => {
  const tb = inspectSyzygy("");
  assert.equal(tb.ready, false);
  assert.equal(tb.pieces, 0);
});

test("a config that does not fit the container is rejected, not clamped", () => {
  const caps = { maxThreadsPerEngine: 8, maxSafeHashMb: 8192 };
  assert.equal(resourceMismatch({ Threads: "8", Hash: "4096" }, caps), null);
  assert.equal(resourceMismatch({ Threads: "16" }, caps), "threads>8");
  assert.equal(resourceMismatch({ Hash: "16384" }, caps), "hash>8192");
});

test("hash policy leaves headroom for NNUE, threads and the Node process", () => {
  assert.equal(recommendedHashMb(16384), 4096);
  assert.equal(recommendedHashMb(32768), 8192);
  assert.ok(maxSafeHashMb(16384) > recommendedHashMb(16384));
});

test("capabilities are browser-safe and describe the real container", () => {
  const caps = capabilities(1);
  assert.ok(caps.cpuCount >= 1);
  assert.ok(caps.memoryMb > 0);
  assert.equal(caps.poolSize, 1);
  assert.equal(caps.maxThreadsPerEngine, caps.cpuCount);
  assert.equal(caps.benchmarkSuiteVersion, BENCHMARK_SUITE_VERSION);
  const serialized = JSON.stringify(caps);
  assert.ok(!/PLAY_ENGINE|PRIVATE KEY|Bearer|\//.test(serialized), "no secrets or paths");
});

test("health advertises the benchmark suite version", () => {
  const out = healthPayload({ size: 1, engines: [], stats: {} }, true);
  assert.equal(out.benchmarkSuiteVersion, BENCHMARK_SUITE_VERSION);
  assert.equal(out.capabilities.benchmarkSuiteVersion, BENCHMARK_SUITE_VERSION);
});

test("the position suite covers Chess960 as well as standard chess", () => {
  const variants = new Set(SUITE_960.map((e) => e.variant ?? "standard"));
  assert.ok(variants.has("chess960"));
  assert.ok(variants.has("standard"));
});
