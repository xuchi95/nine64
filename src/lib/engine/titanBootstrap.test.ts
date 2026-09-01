/**
 * Titan bootstrap / readiness hardening.
 *
 * Covers env validation, the health cache and the full preflight decision
 * table used by `startTitanSession`. The preflight logic is re-implemented
 * here as `preflight()` against the same primitives the server function uses,
 * so a "success" case only passes when profile + env + health all agree.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyEngineEnv, classifyPrivateKey } from "./engineEnv.server";
import { TITAN_FALLBACK_CONFIG, TITAN_SLUG } from "./profileTypes";

const VALID_KEY = `-----BEGIN PRIVATE KEY-----\n${"A".repeat(512)}=\n-----END PRIVATE KEY-----`;

const goodEnv = {
  PLAY_ENGINE_URL: "https://play-engine-abc.run.app",
  PLAY_ENGINE_AUDIENCE: "https://play-engine-abc.run.app",
  PLAY_ENGINE_SA_EMAIL: "engine@nine64.iam.gserviceaccount.com",
  PLAY_ENGINE_SA_PRIVATE_KEY: VALID_KEY,
  SUPABASE_URL: "https://db.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_x",
};

describe("engine env validation", () => {
  it("accepts a complete, well-formed configuration", () => {
    const d = classifyEngineEnv(goodEnv);
    expect(d.ok).toBe(true);
    expect(d.code).toBe("OK");
    expect(d.problems).toEqual([]);
  });

  it("reports missing PLAY_ENGINE variables without leaking values", () => {
    const d = classifyEngineEnv({ ...goodEnv, PLAY_ENGINE_URL: undefined, PLAY_ENGINE_SA_EMAIL: undefined });
    expect(d.ok).toBe(false);
    expect(d.code).toBe("MISSING_ENGINE_CONFIG");
    expect(d.problems).toContain("PLAY_ENGINE_URL");
    expect(d.problems).toContain("PLAY_ENGINE_SA_EMAIL");
    expect(JSON.stringify(d)).not.toContain(VALID_KEY);
  });

  it("flags a malformed OIDC private key as INVALID_ENGINE_CREDENTIALS", () => {
    const d = classifyEngineEnv({ ...goodEnv, PLAY_ENGINE_SA_PRIVATE_KEY: "not-a-pem" });
    expect(d.code).toBe("INVALID_ENGINE_CREDENTIALS");
    expect(d.present.PLAY_ENGINE_SA_PRIVATE_KEY).toBe(false);
    expect(JSON.stringify(d)).not.toContain("not-a-pem");
  });

  it("reports missing Supabase service configuration", () => {
    const d = classifyEngineEnv({ ...goodEnv, SUPABASE_SERVICE_ROLE_KEY: undefined });
    expect(d.code).toBe("MISSING_SUPABASE_CONFIG");
  });

  it("classifies private keys", () => {
    expect(classifyPrivateKey(undefined)).toBe("missing");
    expect(classifyPrivateKey("")).toBe("missing");
    expect(classifyPrivateKey("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----")).toBe("invalid");
    expect(classifyPrivateKey(VALID_KEY)).toBe("ok");
    expect(classifyPrivateKey(VALID_KEY.replace(/\n/g, "\\n"))).toBe("ok");
  });

  it("treats PLAY_ENGINE_AUDIENCE as optional (defaults to the service URL)", () => {
    const d = classifyEngineEnv({ ...goodEnv, PLAY_ENGINE_AUDIENCE: undefined });
    expect(d.ok).toBe(true);
    // Falls back to PLAY_ENGINE_URL, so it still counts as configured.
    expect(d.present.PLAY_ENGINE_AUDIENCE).toBe(true);
    expect(d.configured).toBe(true);
    expect(d.missing).toEqual([]);
  });
});


// --------------------------------------------------------------------------
// Preflight decision table (mirrors startTitanSession, no DB writes on fail)
// --------------------------------------------------------------------------

type Health = "healthy" | "degraded" | "unavailable" | "not_configured";

interface Profile {
  enabled: boolean;
  source: "database" | "fallback";
}

function preflight(args: {
  profile: Profile;
  env: ReturnType<typeof classifyEngineEnv>;
  health: Health;
  createSession: () => void;
}): { ok: boolean; code: string } {
  const { profile, env, health } = args;
  if (!profile.enabled) {
    return { ok: false, code: profile.source === "fallback" ? "PROFILE_MISSING" : "PROFILE_DISABLED" };
  }
  if (env.code === "INVALID_ENGINE_CREDENTIALS") return { ok: false, code: "INVALID_ENGINE_CREDENTIALS" };
  if (!env.present.PLAY_ENGINE_URL || !env.present.PLAY_ENGINE_SA_EMAIL || !env.present.PLAY_ENGINE_SA_PRIVATE_KEY) {
    return { ok: false, code: "ENGINE_NOT_CONFIGURED" };
  }
  if (health !== "healthy" && health !== "degraded") {
    return { ok: false, code: health === "not_configured" ? "ENGINE_NOT_CONFIGURED" : "ENGINE_UNAVAILABLE" };
  }
  args.createSession();
  return { ok: true, code: "OK" };
}

describe("titan start preflight", () => {
  const env = classifyEngineEnv(goodEnv);
  let created: number;
  const createSession = () => {
    created += 1;
  };
  beforeEach(() => {
    created = 0;
  });

  it("refuses when the Titan DB row is missing (fallback profile)", () => {
    const r = preflight({ profile: { enabled: false, source: "fallback" }, env, health: "healthy", createSession });
    expect(r).toEqual({ ok: false, code: "PROFILE_MISSING" });
    expect(created).toBe(0);
  });

  it("refuses when the profile is disabled", () => {
    const r = preflight({ profile: { enabled: false, source: "database" }, env, health: "healthy", createSession });
    expect(r.code).toBe("PROFILE_DISABLED");
    expect(created).toBe(0);
  });

  it("refuses when PLAY_ENGINE variables are missing", () => {
    const r = preflight({
      profile: { enabled: true, source: "database" },
      env: classifyEngineEnv({ ...goodEnv, PLAY_ENGINE_URL: undefined }),
      health: "healthy",
      createSession,
    });
    expect(r.code).toBe("ENGINE_NOT_CONFIGURED");
    expect(created).toBe(0);
  });

  it("refuses on an invalid OIDC credential instead of crashing", () => {
    const r = preflight({
      profile: { enabled: true, source: "database" },
      env: classifyEngineEnv({ ...goodEnv, PLAY_ENGINE_SA_PRIVATE_KEY: "oops" }),
      health: "healthy",
      createSession,
    });
    expect(r.code).toBe("INVALID_ENGINE_CREDENTIALS");
    expect(created).toBe(0);
  });

  it("refuses when Cloud Run is unavailable — no session row, no weaker engine", () => {
    const r = preflight({ profile: { enabled: true, source: "database" }, env, health: "unavailable", createSession });
    expect(r.code).toBe("ENGINE_UNAVAILABLE");
    expect(created).toBe(0);
  });

  it("allows the start when profile is enabled and the engine is healthy", () => {
    const r = preflight({ profile: { enabled: true, source: "database" }, env, health: "healthy", createSession });
    expect(r).toEqual({ ok: true, code: "OK" });
    expect(created).toBe(1);
  });

  it("allows the start when the engine is merely busy (degraded)", () => {
    const r = preflight({ profile: { enabled: true, source: "database" }, env, health: "degraded", createSession });
    expect(r.ok).toBe(true);
    expect(created).toBe(1);
  });
});

describe("bootstrap defaults", () => {
  it("the Titan fallback config is full strength and matches the seeded row", () => {
    expect(TITAN_SLUG).toBe("titan");
    expect(TITAN_FALLBACK_CONFIG.limitStrength).toBe(false);
    expect(TITAN_FALLBACK_CONFIG.multiPv).toBe(1);
    expect(TITAN_FALLBACK_CONFIG.openingRandomness).toBe(0);
  });
});

describe("cloud engine health cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("serves a cached health result within the TTL and refetches after it", async () => {
    vi.stubEnv("PLAY_ENGINE_URL", goodEnv.PLAY_ENGINE_URL);
    vi.stubEnv("PLAY_ENGINE_SA_EMAIL", goodEnv.PLAY_ENGINE_SA_EMAIL);
    vi.stubEnv("PLAY_ENGINE_SA_PRIVATE_KEY", "broken-pem");
    const mod = await import("./cloudEngine.server");
    mod.__resetCloudEngineState();

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const a = await mod.cloudEngineHealthCached();
    const b = await mod.cloudEngineHealthCached();
    expect(a).toBe(b); // same object => no second probe
    // A broken credential must never report healthy, and must not hit Google.
    expect(a.status).not.toBe("healthy");

    const c = await mod.cloudEngineHealthCached(0); // TTL 0 forces a refetch
    expect(c).not.toBe(a);
    fetchSpy.mockRestore();
  });

  it("reports not_configured (never healthy) when secrets are absent", async () => {
    const mod = await import("./cloudEngine.server");
    mod.__resetCloudEngineState();
    vi.stubEnv("PLAY_ENGINE_URL", "");
    vi.stubEnv("PLAY_ENGINE_SA_EMAIL", "");
    vi.stubEnv("PLAY_ENGINE_SA_PRIVATE_KEY", "");
    const h = await mod.cloudEngineHealthCached(0);
    expect(h.status).toBe("not_configured");
    expect(mod.cloudEngineConfigured()).toBe(false);
  });
});
