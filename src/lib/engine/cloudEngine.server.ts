/**
 * Trusted client for the private Cloud Run chess engine (`services/play-engine`).
 *
 * Server-only. The browser never talks to Cloud Run: it has no URL, no token
 * and no way to ask for a best move outside a canonical bot session.
 *
 * Auth: a Google service account JWT is signed here with WebCrypto and
 * exchanged for a Google-signed **OIDC ID token** with the Cloud Run service
 * URL as audience. The service itself stays private (IAM `run.invoker`), so a
 * leaked URL alone grants nothing.
 *
 * When the GCP credentials are absent every call returns `not_configured` —
 * we never fake health and never silently downgrade to a weaker engine.
 */
import type { EngineConfig } from "./profileTypes";
import { parseCapabilities, type EngineCapabilities } from "./capabilities";

export type CloudEngineStatus =
  "ok" | "not_configured" | "unavailable" | "timeout" | "invalid" | "unauthorized";

export interface CloudEngineHealth {
  status: "healthy" | "degraded" | "starting" | "unavailable" | "not_configured" | "unauthorized";
  engineVersion: string | null;
  arch: string | null;
  pool: { size: number; busy: number } | null;
  stats: {
    searches: number;
    timeouts: number;
    restarts: number;
    illegal: number;
    hardStops: number;
  } | null;
  /** Real container hardware, or null when the service predates capabilities. */
  capabilities: EngineCapabilities | null;
  /** Identity of the benchmark suites this engine build ships. */
  benchmarkSuiteVersion: string | null;
  /** Safe build identity of the deployed container image. */
  serviceBuildId: string | null;
  /** Stable service release identity, independent from the image build SHA. */
  serviceVersion: string | null;
  latencyMs: number | null;
  checkedAt: number;
  detail: string;
}

export interface BestMoveRequest {
  /** Exact CURRENT position to search. Canonical contract: never replay history. */
  fen: string;
  variant: "standard" | "chess960";
  config: EngineConfig;
  clock: { whiteMs: number; blackMs: number; whiteIncMs: number; blackIncMs: number } | null;
  sessionId: string;
  requestId: string;
  newGame: boolean;
}

export interface BestMoveResult {
  status: CloudEngineStatus;
  bestmove: string | null;
  ponder: string | null;
  depth: number | null;
  nodes: number | null;
  nps: number | null;
  timeMs: number | null;
  tbHits: number | null;
  engineVersion: string | null;
  error?: string;
}

interface Credentials {
  clientEmail: string;
  privateKey: string;
  url: string;
  audience: string;
}

export function cloudEngineConfigured(): boolean {
  return Boolean(
    process.env["PLAY_ENGINE_URL"] &&
    process.env["PLAY_ENGINE_SA_EMAIL"] &&
    process.env["PLAY_ENGINE_SA_PRIVATE_KEY"],
  );
}

/** Trim + drop a trailing slash. Never logged. */
export function normalizeEngineUrl(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value || /\s/.test(value)) return null;
  if (!/^https:\/\//i.test(value)) return null;
  return value.replace(/\/+$/, "");
}

/**
 * Accepts both a real multiline PEM and a provider-escaped `\n` PEM and
 * returns a valid PEM. Nothing else about the key is mutated, and the key is
 * never logged — a parse failure only ever yields `null`.
 */
export function normalizePrivateKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const pem = raw.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "").trim();
  if (!pem.startsWith("-----BEGIN PRIVATE KEY-----")) return null;
  if (!pem.endsWith("-----END PRIVATE KEY-----")) return null;
  return `${pem}\n`;
}

function credentials(): Credentials | null {
  const url = normalizeEngineUrl(process.env["PLAY_ENGINE_URL"]);
  const clientEmail = (process.env["PLAY_ENGINE_SA_EMAIL"] ?? "").trim();
  const privateKey = normalizePrivateKey(process.env["PLAY_ENGINE_SA_PRIVATE_KEY"]);
  if (!url || !clientEmail || !privateKey) return null;
  return {
    url,
    clientEmail,
    privateKey,
    // Cloud Run ID tokens are minted for the service URL unless overridden.
    audience: normalizeEngineUrl(process.env["PLAY_ENGINE_AUDIENCE"]) ?? url,
  };
}

// --------------------------------------------------------------------------
// OIDC token minting (service-account JWT -> Google-signed ID token)
// --------------------------------------------------------------------------
let tokenCache: { token: string; expiresAt: number } | null = null;

function b64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? bytes : String.fromCharCode(...Array.from(bytes));
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

async function idToken(creds: Credentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt - 120 > now) return tokenCache.token;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: creds.clientEmail,
      sub: creds.clientEmail,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      target_audience: creds.audience,
    }),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(creds.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(`${header}.${claims}`),
    ),
  );
  const assertion = `${header}.${claims}.${b64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`oidc_exchange_failed_${res.status}`);
  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) throw new Error("oidc_missing_id_token");
  tokenCache = { token: json.id_token, expiresAt: now + 3000 };
  return json.id_token;
}

/** Test seam. */
export function __resetCloudEngineState(): void {
  tokenCache = null;
  healthCache = null;
  breaker = { failures: 0, openUntil: 0 };
}

// --------------------------------------------------------------------------
// Circuit breaker
// --------------------------------------------------------------------------
let breaker = { failures: 0, openUntil: 0 };
const BREAKER_THRESHOLD = 4;
const BREAKER_COOLDOWN_MS = 30_000;

export function breakerState(): { open: boolean; failures: number; openUntil: number } {
  return {
    open: Date.now() < breaker.openUntil,
    failures: breaker.failures,
    openUntil: breaker.openUntil,
  };
}

function noteFailure(): void {
  breaker.failures += 1;
  if (breaker.failures >= BREAKER_THRESHOLD) {
    breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    breaker.failures = 0;
  }
}

function noteSuccess(): void {
  breaker = { failures: 0, openUntil: 0 };
}

export type CloudCallResult<T> =
  | { ok: true; data: T; httpStatus: number }
  | { ok: false; status: CloudEngineStatus; error: string; httpStatus: number | null };

/**
 * The single entry point for every Cloud Run call. It owns OIDC token
 * acquisition, audience, timeout, JSON parsing, status mapping and
 * secret-free logging, so no caller re-implements auth.
 */
export async function callCloudEngine<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    timeoutMs?: number;
    parseErrorStatuses?: number[];
  } = {},
): Promise<CloudCallResult<T>> {
  const method = options.method ?? "POST";
  const timeoutMs = options.timeoutMs ?? 8_000;
  const creds = credentials();
  if (!creds) {
    return {
      ok: false,
      status: "not_configured",
      error: "PLAY_ENGINE_* is unset",
      httpStatus: null,
    };
  }
  if (Date.now() < breaker.openUntil) {
    return { ok: false, status: "unavailable", error: "circuit_open", httpStatus: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let token: string;
    try {
      token = await idToken(creds);
    } catch {
      // A bad key or a rejected assertion must never surface as a raw error.
      return { ok: false, status: "unauthorized", error: "oidc_mint_failed", httpStatus: null };
    }
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (method === "POST") headers["content-type"] = "application/json";
    const res = await fetch(`${creds.url}${path}`, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(options.body ?? {}) : null,
      signal: controller.signal,
    });
    if (!res.ok && !options.parseErrorStatuses?.includes(res.status)) {
      noteFailure();
      const unauth = res.status === 401 || res.status === 403;
      return {
        ok: false,
        status: unauth ? "unauthorized" : "unavailable",
        error: `http_${res.status}`,
        httpStatus: res.status,
      };
    }
    noteSuccess();
    let data: T;
    try {
      data = (await res.json()) as T;
    } catch {
      return { ok: false, status: "invalid", error: "invalid_json", httpStatus: res.status };
    }
    return { ok: true, data, httpStatus: res.status };
  } catch (err) {
    noteFailure();
    const aborted = err instanceof Error && err.name === "AbortError";
    // Structured log, no credentials, no FEN payload dump.
    console.error("[play-engine] call failed", { path, aborted });
    return {
      ok: false,
      status: aborted ? "timeout" : "unavailable",
      error: aborted ? "timeout" : "network_error",
      httpStatus: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function call<T>(
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<{ ok: true; data: T } | { ok: false; status: CloudEngineStatus; error: string }> {
  const res = await callCloudEngine<T>(path, { method: "POST", body, timeoutMs });
  return res.ok
    ? { ok: true, data: res.data }
    : { ok: false, status: res.status, error: res.error };
}

/** Production health endpoint. Cloud Run intercepts some `*z` paths. */
export const HEALTH_PATH = "/health";

/**
 * Defensive parse of the /health contract. A malformed or partial payload is
 * never trusted: it downgrades the reported status instead of throwing.
 * Healthy requires `status === "ok"` AND an engineVersion — a 200 alone is
 * not enough.
 */
export function interpretHealthPayload(raw: unknown, latencyMs: number): CloudEngineHealth {
  const body = (raw ?? {}) as Record<string, unknown>;
  const statusText = typeof body["status"] === "string" ? (body["status"] as string) : null;
  const engineVersion =
    typeof body["engineVersion"] === "string" ? (body["engineVersion"] as string) : null;
  const arch = typeof body["arch"] === "string" ? (body["arch"] as string) : null;
  const checkedAt = Date.now();

  const rawPool = body["pool"];
  let pool: { size: number; busy: number } | null = null;
  if (rawPool && typeof rawPool === "object" && !Array.isArray(rawPool)) {
    const size = Number((rawPool as Record<string, unknown>)["size"]);
    const busy = Number((rawPool as Record<string, unknown>)["busy"]);
    if (Number.isFinite(size) && Number.isFinite(busy) && size > 0 && busy >= 0) {
      pool = { size: Math.trunc(size), busy: Math.trunc(busy) };
    }
  }

  const rawStats = body["stats"];
  let stats: CloudEngineHealth["stats"] = null;
  if (rawStats && typeof rawStats === "object" && !Array.isArray(rawStats)) {
    const s = rawStats as Record<string, unknown>;
    stats = {
      searches: Number(s["searches"] ?? 0) || 0,
      timeouts: Number(s["timeouts"] ?? 0) || 0,
      restarts: Number(s["restarts"] ?? 0) || 0,
      illegal: Number(s["illegal"] ?? 0) || 0,
      hardStops: Number(s["hardStops"] ?? 0) || 0,
    };
  }

  const capabilities = parseCapabilities(body["capabilities"]);
  const buildRaw = body["serviceBuildId"];
  const serviceBuildId =
    typeof buildRaw === "string" && /^[\w.\-]{1,64}$/.test(buildRaw) ? buildRaw : null;
  const versionRaw = body["serviceVersion"];
  const serviceVersion =
    typeof versionRaw === "string" && /^[\w.\-]{1,64}$/.test(versionRaw) ? versionRaw : null;
  const suiteRaw = body["benchmarkSuiteVersion"];
  const benchmarkSuiteVersion =
    typeof suiteRaw === "string" && suiteRaw
      ? suiteRaw
      : (capabilities?.benchmarkSuiteVersion ?? null);

  if (statusText === "starting") {
    return {
      status: "starting",
      engineVersion,
      arch,
      pool,
      stats,
      capabilities,
      benchmarkSuiteVersion,
      serviceBuildId,
      serviceVersion,
      latencyMs,
      checkedAt,
      detail: "Engine đang khởi động.",
    };
  }

  if (!pool || statusText !== "ok" || !engineVersion) {
    // Unknown shape or an engine that is still starting: never report healthy.
    return {
      status: pool && statusText === "ok" ? "degraded" : pool ? "degraded" : "unavailable",
      engineVersion,
      arch,
      pool,
      stats,
      capabilities,
      benchmarkSuiteVersion,
      serviceBuildId,
      serviceVersion,
      latencyMs,
      checkedAt,
      detail: pool ? "Engine chưa sẵn sàng." : "Phản hồi /health không hợp lệ.",
    };
  }

  const busy = pool.busy >= pool.size;
  return {
    status: busy ? "degraded" : "healthy",
    engineVersion,
    arch,
    pool,
    stats,
    capabilities,
    benchmarkSuiteVersion,
    serviceBuildId,
    serviceVersion,
    latencyMs,
    checkedAt,
    detail: busy ? "Toàn bộ engine process đang bận." : "OK",
  };
}

export async function cloudEngineHealth(): Promise<CloudEngineHealth> {
  const creds = credentials();
  const empty = {
    engineVersion: null,
    arch: null,
    pool: null,
    stats: null,
    capabilities: null,
    benchmarkSuiteVersion: null,
    serviceBuildId: null,
    serviceVersion: null,
    checkedAt: Date.now(),
  };
  if (!creds) {
    return {
      ...empty,
      status: "not_configured",
      latencyMs: null,
      detail: "Chưa cấu hình PLAY_ENGINE_URL / service account.",
    };
  }
  const startedAt = Date.now();
  const res = await callCloudEngine<unknown>(HEALTH_PATH, {
    method: "GET",
    timeoutMs: 8_000,
    // A conforming cold service returns its full contract with HTTP 503.
    parseErrorStatuses: [503],
  });
  if (!res.ok) {
    return {
      ...empty,
      checkedAt: Date.now(),
      status: res.status === "unauthorized" ? "unauthorized" : "unavailable",
      latencyMs: Date.now() - startedAt,
      detail: res.error,
    };
  }
  return interpretHealthPayload(res.data, Date.now() - startedAt);
}

// --------------------------------------------------------------------------
// Short-lived health cache: the play preflight must not hammer /health.
// --------------------------------------------------------------------------
let healthCache: { value: CloudEngineHealth; fetchedAt: number } | null = null;
const HEALTH_TTL_MS = 10_000;

export async function cloudEngineHealthCached(
  maxAgeMs = HEALTH_TTL_MS,
): Promise<CloudEngineHealth> {
  if (healthCache && Date.now() - healthCache.fetchedAt < maxAgeMs) return healthCache.value;
  const value = await cloudEngineHealth();
  healthCache = { value, fetchedAt: Date.now() };
  return value;
}

/** Only the allowlisted UCI options ever leave this process. */
function uciOptions(config: EngineConfig): Record<string, string | number | boolean> {
  const options: Record<string, string | number | boolean> = {
    Threads: config.threads,
    Hash: config.hashMb,
    MultiPV: config.multiPv,
    UCI_LimitStrength: config.limitStrength,
    "Move Overhead": config.moveOverheadMs,
    Ponder: config.ponder,
  };
  if (config.skill !== null) options["Skill Level"] = config.skill;
  if (config.limitStrength && config.uciElo !== null) options["UCI_Elo"] = config.uciElo;
  if (config.syzygyEnabled && config.syzygyPieces > 0) {
    options["SyzygyProbeLimit"] = Math.min(config.syzygyProbeLimit, config.syzygyPieces);
  }
  return options;
}

export async function requestBestMove(req: BestMoveRequest): Promise<BestMoveResult> {
  const { config } = req;
  const search: Record<string, unknown> = { policy: config.timePolicy };
  if (config.timePolicy === "clock" && req.clock) {
    search["wtimeMs"] = req.clock.whiteMs;
    search["btimeMs"] = req.clock.blackMs;
    search["wincMs"] = req.clock.whiteIncMs;
    search["bincMs"] = req.clock.blackIncMs;
    search["maxMoveTimeMs"] = config.maxMoveTimeMs;
    search["clockFraction"] = config.clockFraction;
  } else if (config.timePolicy === "depth" && config.depth) {
    search["depth"] = config.depth;
  } else if (config.timePolicy === "nodes" && config.nodes) {
    search["nodes"] = config.nodes;
  } else {
    search["movetimeMs"] = Math.min(config.moveTimeMs, config.maxMoveTimeMs);
  }

  const attempts = config.maxRetries + 1;
  let last: BestMoveResult = {
    status: "unavailable",
    bestmove: null,
    ponder: null,
    depth: null,
    nodes: null,
    nps: null,
    timeMs: null,
    tbHits: null,
    engineVersion: null,
  };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const res = await call<{
      bestmove?: string;
      ponder?: string | null;
      depth?: number;
      nodes?: number;
      nps?: number;
      timeMs?: number;
      tbHits?: number;
      engineVersion?: string;
    }>(
      "/bestmove",
      {
        fen: req.fen,
        // Canonical contract: the FEN is the position to search, so the engine
        // never replays historical moves on top of it.
        moves: [],
        variant: req.variant,
        options: { ...uciOptions(config), UCI_Chess960: req.variant === "chess960" },
        search,
        // Top-level fields the engine service reads directly.
        movetimeMs:
          config.timePolicy === "movetime"
            ? Math.min(config.moveTimeMs, config.maxMoveTimeMs)
            : undefined,
        clock: config.timePolicy === "clock" && req.clock ? req.clock : undefined,
        timeoutMs: config.requestTimeoutMs,
        newGame: req.newGame,
        sessionId: req.sessionId,
        requestId: req.requestId,
      },
      config.requestTimeoutMs,
    );

    if (res.ok && res.data.bestmove) {
      return {
        status: "ok",
        bestmove: res.data.bestmove,
        ponder: res.data.ponder ?? null,
        depth: res.data.depth ?? null,
        nodes: res.data.nodes ?? null,
        nps: res.data.nps ?? null,
        timeMs: res.data.timeMs ?? null,
        tbHits: res.data.tbHits ?? null,
        engineVersion: res.data.engineVersion ?? null,
      };
    }
    last = {
      status: res.ok ? "invalid" : res.status,
      bestmove: null,
      ponder: null,
      depth: null,
      nodes: null,
      nps: null,
      timeMs: null,
      tbHits: null,
      engineVersion: null,
      error: res.ok ? "missing_bestmove" : res.error,
    };
    if (!res.ok && res.status === "not_configured") break;
  }
  return last;
}

/**
 * Per-kind search budget. `bench`/`speedtest` run Stockfish's native bench and
 * ignore movetime; the suites get a realistic per-position budget instead of
 * the old 1s that made tactics scoring meaningless.
 */
export const BENCHMARK_MOVETIME_MS: Record<BenchmarkRun["kind"], number | null> = {
  bench: null,
  speedtest: null,
  epd: 3_000,
  positions: 1_500,
};

export interface BenchmarkRun {
  kind: "bench" | "speedtest" | "epd" | "positions";
  status: CloudEngineStatus;
  engineVersion: string | null;
  nodes: number | null;
  nps: number | null;
  depth: number | null;
  score: number | null;
  passed: boolean;
  detail: Record<string, unknown>;
  error?: string;
}

export async function runCloudBenchmark(
  kind: BenchmarkRun["kind"],
  config: EngineConfig,
  options: { movetimeMs?: number } = {},
): Promise<BenchmarkRun> {
  const res = await call<{
    engineVersion?: string;
    nodes?: number;
    nps?: number;
    depth?: number;
    score?: number;
    passed?: boolean;
    detail?: Record<string, unknown>;
  }>(
    "/benchmark",
    {
      kind,
      options: uciOptions(config),
      movetimeMs: options.movetimeMs ?? BENCHMARK_MOVETIME_MS[kind] ?? null,
    },
    // Wall-clock budget must comfortably exceed the total suite search time.
    Math.max(config.requestTimeoutMs, 300_000),
  );
  if (!res.ok) {
    return {
      kind,
      status: res.status,
      engineVersion: null,
      nodes: null,
      nps: null,
      depth: null,
      score: null,
      passed: false,
      detail: {},
      error: res.error,
    };
  }
  return {
    kind,
    status: "ok",
    engineVersion: res.data.engineVersion ?? null,
    nodes: res.data.nodes ?? null,
    nps: res.data.nps ?? null,
    depth: res.data.depth ?? null,
    score: res.data.score ?? null,
    passed: Boolean(res.data.passed),
    detail: res.data.detail ?? {},
  };
}
