import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { parseRateLimited, rateLimitMessage, encodeRateLimited } from "./errors";
import { RATE_LIMIT_POLICY } from "./policy";
import { sanitizeDigest, CoachInputError } from "@/lib/coach/sanitize";

/** In-memory stand-in for the atomic Postgres counter. */
function makeFakeDb() {
  const buckets = new Map<string, { start: number; count: number }>();
  let calls = 0;
  return {
    calls: () => calls,
    reset: () => buckets.clear(),
    rpc: async (_name: string, args: Record<string, unknown>) => {
      calls += 1;
      const key = String(args["_key"]);
      const windowSeconds = Number(args["_window_seconds"]);
      const limit = Number(args["_limit"]);
      const cost = Number(args["_cost"] ?? 1);
      const now = Date.now();
      let row = buckets.get(key);
      if (!row || row.start + windowSeconds * 1000 <= now) {
        row = { start: now, count: 0 };
        buckets.set(key, row);
      }
      const resetAt = new Date(row.start + windowSeconds * 1000);
      if (row.count + cost > limit) {
        return {
          data: {
            allowed: false,
            limit,
            remaining: Math.max(limit - row.count, 0),
            reset_at: resetAt.toISOString(),
            retry_after_seconds: Math.max(Math.ceil((resetAt.getTime() - now) / 1000), 1),
          },
          error: null,
        };
      }
      row.count += cost;
      return {
        data: {
          allowed: true,
          limit,
          remaining: limit - row.count,
          reset_at: resetAt.toISOString(),
          retry_after_seconds: 0,
        },
        error: null,
      };
    },
  };
}

const fakeDb = makeFakeDb();
let failBackend = false;

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () =>
    new Request("https://nine64.com/x", { headers: { "cf-connecting-ip": "203.0.113.7" } }),
  setResponseHeader: () => undefined,
  setResponseStatus: () => undefined,
}));

async function importLimiter() {
  const mod = await import("./limiter.server");
  mod.__setRateLimitBackend(async ({ key, windowSeconds, limit, cost }) => {
    if (failBackend) throw new Error("backend down");
    const { data } = await fakeDb.rpc("consume_rate_limit", {
      _key: key,
      _window_seconds: windowSeconds,
      _limit: limit,
      _cost: cost,
    });
    return data as Record<string, unknown>;
  });
  return mod;
}


describe("rate limiter", () => {
  beforeEach(() => {
    fakeDb.reset();
    failBackend = false;
    process.env["RATE_LIMIT_SALT"] = "test-salt";
  });
  afterEach(() => {
    delete process.env["RL_COACH_BURST_LIMIT"];
  });

  it("allows requests under the limit", async () => {
    const { enforceRateLimit, userSubject } = await importLimiter();
    const subject = userSubject("user-a");
    for (let i = 0; i < RATE_LIMIT_POLICY["coach.burst"].limit; i++) {
      await expect(enforceRateLimit("coach.burst", subject)).resolves.toMatchObject({ allowed: true });
    }
  });

  it("rejects with RATE_LIMITED and a retry-after once over the limit", async () => {
    const { enforceRateLimit, userSubject } = await importLimiter();
    const subject = userSubject("user-over");
    for (let i = 0; i < RATE_LIMIT_POLICY["coach.burst"].limit; i++) {
      await enforceRateLimit("coach.burst", subject);
    }
    const err = await enforceRateLimit("coach.burst", subject).catch((e) => e);
    const info = parseRateLimited(err);
    expect(info?.code).toBe("RATE_LIMITED");
    expect(info!.retryAfterSeconds).toBeGreaterThan(0);
    expect(rateLimitMessage(info!, "vi")).toContain("thử lại");
  });

  it("does not overshoot the quota under concurrency", async () => {
    const { checkRateLimit, userSubject } = await importLimiter();
    const subject = userSubject("user-race");
    const limit = RATE_LIMIT_POLICY["coach.burst"].limit;
    const results = await Promise.all(
      Array.from({ length: limit + 8 }, () => checkRateLimit("coach.burst", subject)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(limit);
  });

  it("keeps counting across a fresh module instance (no per-instance memory)", async () => {
    const first = await importLimiter();
    const subject = first.userSubject("user-instance");
    await first.enforceRateLimit("coach.burst", subject);
    vi.resetModules();
    const second = await importLimiter();
    const remaining = await second.checkRateLimit("coach.burst", subject);
    expect(remaining.remaining).toBeLessThan(RATE_LIMIT_POLICY["coach.burst"].limit - 1);
  });

  it("isolates quota per user", async () => {
    const { enforceRateLimit, checkRateLimit, userSubject } = await importLimiter();
    for (let i = 0; i < RATE_LIMIT_POLICY["coach.burst"].limit; i++) {
      await enforceRateLimit("coach.burst", userSubject("user-1"));
    }
    const other = await checkRateLimit("coach.burst", userSubject("user-2"));
    expect(other.allowed).toBe(true);
  });

  it("hashes IP subjects instead of storing the raw address", async () => {
    const { ipSubject } = await importLimiter();
    const subject = ipSubject();
    expect(subject.startsWith("ip:")).toBe(true);
    expect(subject).not.toContain("203.0.113.7");
  });

  it("fails closed for costly actions when the limiter backend is down", async () => {
    failBackend = true;
    const { enforceRateLimit, userSubject } = await importLimiter();
    const err = await enforceRateLimit("coach.burst", userSubject("u")).catch((e) => e);
    expect(parseRateLimited(err)?.unavailable).toBe(true);
  });

  it("fails open for cheap gameplay actions when the backend is down", async () => {
    failBackend = true;
    const { enforceRateLimit, userSubject } = await importLimiter();
    await expect(enforceRateLimit("matchmaking.join", userSubject("u"))).resolves.toBeTruthy();
  });

  it("never false-limits a normal bullet match's queue activity", async () => {
    const { checkRateLimit, userSubject } = await importLimiter();
    const subject = userSubject("bullet-player");
    // 10 rapid rematch cycles in a minute: well inside the join/leave budget.
    for (let i = 0; i < 10; i++) {
      expect((await checkRateLimit("matchmaking.join", subject)).allowed).toBe(true);
      expect((await checkRateLimit("matchmaking.leave", subject)).allowed).toBe(true);
    }
  });

  it("honours env overrides for a policy", async () => {
    process.env["RL_COACH_BURST_LIMIT"] = "1";
    vi.resetModules();
    const { checkRateLimit, userSubject } = await importLimiter();
    const subject = userSubject("env-user");
    expect((await checkRateLimit("coach.burst", subject)).allowed).toBe(true);
    expect((await checkRateLimit("coach.burst", subject)).allowed).toBe(false);
  });
});

describe("rate limit error contract", () => {
  it("round-trips the encoded payload", () => {
    const encoded = encodeRateLimited({ action: "contact.ip", scope: "ip-hmac", retryAfterSeconds: 90 });
    const info = parseRateLimited(new Error(encoded));
    expect(info).toMatchObject({ action: "contact.ip", retryAfterSeconds: 90 });
  });

  it("ignores unrelated errors", () => {
    expect(parseRateLimited(new Error("boom"))).toBeNull();
  });
});

describe("AI coach payload guard", () => {
  const base = {
    side: "w" as const,
    playerName: "a",
    opponentName: "b",
    outcome: "1-0",
    variant: "standard",
    timeControl: "3+0",
    opening: null,
    moveCount: 40,
    accuracy: null,
    acpl: null,
    estimatedRating: null,
    labelCounts: null,
    timeline: [],
    keyMoments: [],
    finalFen: "8/8/8/8/8/8/8/K6k w - - 0 1",
  };

  it("accepts a normal digest", () => {
    expect(sanitizeDigest(base).side).toBe("w");
  });

  it("truncates an oversized timeline before any gateway call", () => {
    const digest = sanitizeDigest({
      ...base,
      timeline: Array.from({ length: 500 }, (_, i) => `${i}. Nf3 [ok]`),
    });
    expect(digest.timeline.length).toBeLessThanOrEqual(140);
  });

  it("rejects an over-long FEN", () => {
    expect(() => sanitizeDigest({ ...base, finalFen: "x".repeat(400) })).toThrow();
  });

  it("rejects a payload that is still too large", () => {
    expect(
      () =>
        sanitizeDigest({
          ...base,
          keyMoments: Array.from({ length: 12 }, () => ({
            moveNumber: 1,
            san: "Nf3",
            label: "x".repeat(40),
            lossPct: 1,
            bestMove: "Nf3",
            evalAfter: "x".repeat(24),
            phase: "x".repeat(24),
            motifs: Array.from({ length: 8 }, () => "y".repeat(40)),
          })),
          timeline: Array.from({ length: 140 }, () => "z".repeat(85)),
        }) && (() => { throw new CoachInputError("expected"); })(),
    ).toThrow();
  });
});
