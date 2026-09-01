/**
 * Production Cloud Run connectivity contract for Nine64 Titan.
 *
 * Covers PEM normalization, URL normalization, the `/health` (never
 * `/healthz`) probe, the OIDC bearer/audience and the mapping of HTTP status
 * codes to public-safe engine states. No test ever asserts on a secret value.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetCloudEngineState,
  cloudEngineHealth,
  HEALTH_PATH,
  interpretHealthPayload,
  normalizeEngineUrl,
  normalizePrivateKey,
} from "./cloudEngine.server";
import { classifyEngineEnv } from "./engineEnv.server";

const URL_PROD = "https://play-engine-v2-3fmlxradta-as.a.run.app";
const BODY = "A".repeat(512) + "=";
const PEM_MULTILINE = `-----BEGIN PRIVATE KEY-----\n${BODY}\n-----END PRIVATE KEY-----`;
const PEM_ESCAPED = `-----BEGIN PRIVATE KEY-----\\n${BODY}\\n-----END PRIVATE KEY-----\\n`;

const HEALTHY = {
  status: "ok",
  engineVersion: "Stockfish 18",
  arch: "x64",
  pool: { size: 1, busy: 0 },
  stats: { searches: 0, timeouts: 0, restarts: 0, illegal: 0 },
};

function envSetup(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    PLAY_ENGINE_URL: `${URL_PROD}/`,
    PLAY_ENGINE_AUDIENCE: URL_PROD,
    PLAY_ENGINE_SA_EMAIL: "nine64-backend@chess-nine64.iam.gserviceaccount.com",
    PLAY_ENGINE_SA_PRIVATE_KEY: PEM_ESCAPED,
    ...overrides,
  };
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

/** Fake fetch: OIDC exchange + one engine response. Records every request. */
function mockFetch(engine: { status: number; body?: unknown }) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ id_token: "id.token.value" }), { status: 200 });
    }
    if (engine.status === 0) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    return new Response(JSON.stringify(engine.body ?? {}), { status: engine.status });
  });
  vi.stubGlobal("fetch", impl);
  return calls;
}

// Signing a real assertion requires a real key; stub WebCrypto instead.
beforeEach(() => {
  __resetCloudEngineState();
  vi.spyOn(crypto.subtle, "importKey").mockResolvedValue({} as CryptoKey);
  vi.spyOn(crypto.subtle, "sign").mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("secret normalization", () => {
  it("normalizes both PEM shapes to a valid key and never mutates the body", () => {
    expect(normalizePrivateKey(PEM_MULTILINE)).toContain(BODY);
    expect(normalizePrivateKey(PEM_ESCAPED)).toBe(`${PEM_MULTILINE}\n`);
  });

  it("rejects an invalid PEM without echoing it", () => {
    expect(normalizePrivateKey("not-a-pem")).toBeNull();
    expect(normalizePrivateKey(undefined)).toBeNull();
    expect(classifyEngineEnv({ PLAY_ENGINE_SA_PRIVATE_KEY: "not-a-pem" }).code).toBe(
      "INVALID_ENGINE_CREDENTIALS",
    );
  });

  it("requires https and strips the trailing slash", () => {
    expect(normalizeEngineUrl(`${URL_PROD}/`)).toBe(URL_PROD);
    expect(normalizeEngineUrl("http://insecure.example")).toBeNull();
    expect(normalizeEngineUrl(" https://a b.example")).toBeNull();
  });

  it("marks the four production secrets as configured", () => {
    const d = classifyEngineEnv({
      PLAY_ENGINE_URL: URL_PROD,
      PLAY_ENGINE_AUDIENCE: URL_PROD,
      PLAY_ENGINE_SA_EMAIL: "nine64-backend@chess-nine64.iam.gserviceaccount.com",
      PLAY_ENGINE_SA_PRIVATE_KEY: PEM_ESCAPED,
    });
    expect(d.configured).toBe(true);
    expect(d.missing).toEqual([]);
    expect(JSON.stringify(d)).not.toContain(BODY);
  });

  it("reports each missing engine secret", () => {
    for (const name of ["PLAY_ENGINE_URL", "PLAY_ENGINE_SA_EMAIL", "PLAY_ENGINE_SA_PRIVATE_KEY"]) {
      const d = classifyEngineEnv({
        PLAY_ENGINE_URL: URL_PROD,
        PLAY_ENGINE_SA_EMAIL: "nine64-backend@chess-nine64.iam.gserviceaccount.com",
        PLAY_ENGINE_SA_PRIVATE_KEY: PEM_ESCAPED,
        [name]: undefined,
      });
      expect(d.configured).toBe(false);
      expect(d.missing).toContain(name);
    }
  });
});

describe("health probe", () => {
  it("calls GET /health with a Google ID token — never /healthz", async () => {
    envSetup();
    const calls = mockFetch({ status: 200, body: HEALTHY });
    const health = await cloudEngineHealth();

    expect(HEALTH_PATH).toBe("/health");
    const engineCall = calls.find((c) => !c.url.includes("oauth2.googleapis.com"))!;
    expect(engineCall.url).toBe(`${URL_PROD}/health`);
    expect(engineCall.url).not.toContain("healthz");
    expect(engineCall.init?.method).toBe("GET");
    expect((engineCall.init?.headers as Record<string, string>)["authorization"]).toBe(
      "Bearer id.token.value",
    );

    // The OIDC assertion targets exactly PLAY_ENGINE_AUDIENCE.
    const tokenCall = calls.find((c) => c.url.includes("oauth2.googleapis.com"))!;
    const assertion = new URLSearchParams(String(tokenCall.init?.body)).get("assertion")!;
    const claims = JSON.parse(atob(assertion.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    expect(claims.target_audience).toBe(URL_PROD);

    expect(health.status).toBe("healthy");
    expect(health.engineVersion).toBe("Stockfish 18");
    expect(health.pool).toEqual({ size: 1, busy: 0 });
  });

  it("is not configured when a secret is missing (and never calls out)", async () => {
    envSetup({ PLAY_ENGINE_SA_PRIVATE_KEY: undefined });
    const calls = mockFetch({ status: 200, body: HEALTHY });
    const health = await cloudEngineHealth();
    expect(health.status).toBe("not_configured");
    expect(calls).toHaveLength(0);
  });

  it("maps HTTP status codes to public-safe states", async () => {
    const cases: [number, string][] = [
      [404, "unavailable"],
      [401, "unauthorized"],
      [403, "unauthorized"],
      [500, "unavailable"],
      [503, "unavailable"],
      [0, "unavailable"],
    ];
    for (const [status, expected] of cases) {
      envSetup();
      __resetCloudEngineState();
      mockFetch({ status });
      const health = await cloudEngineHealth();
      expect(health.status).toBe(expected);
      expect(JSON.stringify(health)).not.toContain(BODY);
    }
  });

  it("refuses to call a 200 healthy when the payload is wrong", () => {
    expect(interpretHealthPayload({ status: "starting", pool: { size: 1, busy: 0 } }, 10).status).toBe(
      "degraded",
    );
    expect(interpretHealthPayload({ status: "ok", pool: { size: 1, busy: 0 } }, 10).status).toBe(
      "degraded",
    );
    expect(interpretHealthPayload({}, 10).status).toBe("unavailable");
    expect(interpretHealthPayload(HEALTHY, 10).stats).toEqual(HEALTHY.stats);
  });
});
