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
  assert.deepEqual(out.stats, { searches: 3, timeouts: 0, restarts: 1, illegal: 0 });
});

test("healthPayload reports starting before the pool is ready and never leaks env", () => {
  const out = healthPayload({ size: 1, engines: [], stats: {} }, false);
  assert.equal(out.status, "starting");
  assert.deepEqual(out.stats, { searches: 0, timeouts: 0, restarts: 0, illegal: 0 });
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
