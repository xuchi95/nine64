import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeOptions, buildGoArgs } from "../src/index.js";
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
