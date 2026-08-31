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

export type CloudEngineStatus = "ok" | "not_configured" | "unavailable" | "timeout" | "invalid";

export interface CloudEngineHealth {
  status: "healthy" | "degraded" | "unavailable" | "not_configured";
  engineVersion: string | null;
  arch: string | null;
  pool: { size: number; busy: number } | null;
  latencyMs: number | null;
  detail: string;
}

export interface BestMoveRequest {
  fen: string;
  moves: string[];
  config: EngineConfig;
  clock: { whiteMs: number; blackMs: number; whiteIncMs: number; blackIncMs: number } | null;
  sessionId: string;
  requestId: string;
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

function credentials(): Credentials | null {
  const url = process.env["PLAY_ENGINE_URL"];
  const clientEmail = process.env["PLAY_ENGINE_SA_EMAIL"];
  const privateKey = process.env["PLAY_ENGINE_SA_PRIVATE_KEY"];
  if (!url || !clientEmail || !privateKey) return null;
  return {
    url: url.replace(/\/$/, ""),
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
    audience: process.env["PLAY_ENGINE_AUDIENCE"] ?? url.replace(/\/$/, ""),
  };
}

// --------------------------------------------------------------------------
// OIDC token minting (service-account JWT -> Google-signed ID token)
// --------------------------------------------------------------------------
let tokenCache: { token: string; expiresAt: number } | null = null;

function b64url(bytes: Uint8Array | string): string {
  const raw =
    typeof bytes === "string" ? bytes : String.fromCharCode(...Array.from(bytes));
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
  breaker = { failures: 0, openUntil: 0 };
}

// --------------------------------------------------------------------------
// Circuit breaker
// --------------------------------------------------------------------------
let breaker = { failures: 0, openUntil: 0 };
const BREAKER_THRESHOLD = 4;
const BREAKER_COOLDOWN_MS = 30_000;

export function breakerState(): { open: boolean; failures: number; openUntil: number } {
  return { open: Date.now() < breaker.openUntil, failures: breaker.failures, openUntil: breaker.openUntil };
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

async function call<T>(
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<{ ok: true; data: T } | { ok: false; status: CloudEngineStatus; error: string }> {
  const creds = credentials();
  if (!creds) return { ok: false, status: "not_configured", error: "PLAY_ENGINE_* is unset" };
  if (Date.now() < breaker.openUntil) {
    return { ok: false, status: "unavailable", error: "circuit_open" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = await idToken(creds);
    const res = await fetch(`${creds.url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      noteFailure();
      return { ok: false, status: "unavailable", error: `http_${res.status}` };
    }
    noteSuccess();
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    noteFailure();
    const aborted = err instanceof Error && err.name === "AbortError";
    // Structured log, no credentials, no FEN payload dump.
    console.error("[play-engine] call failed", { path, aborted });
    return {
      ok: false,
      status: aborted ? "timeout" : "unavailable",
      error: aborted ? "timeout" : "network_error",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Defensive parse of the /healthz contract. A malformed or partial payload is
 * never trusted: it downgrades the reported status instead of throwing.
 */
export function interpretHealthPayload(
  raw: unknown,
  latencyMs: number,
): CloudEngineHealth {
  const body = (raw ?? {}) as Record<string, unknown>;
  const statusText = typeof body["status"] === "string" ? (body["status"] as string) : null;
  const engineVersion = typeof body["engineVersion"] === "string" ? (body["engineVersion"] as string) : null;
  const arch = typeof body["arch"] === "string" ? (body["arch"] as string) : null;

  const rawPool = body["pool"];
  let pool: { size: number; busy: number } | null = null;
  if (rawPool && typeof rawPool === "object" && !Array.isArray(rawPool)) {
    const size = Number((rawPool as Record<string, unknown>)["size"]);
    const busy = Number((rawPool as Record<string, unknown>)["busy"]);
    if (Number.isFinite(size) && Number.isFinite(busy) && size > 0 && busy >= 0) {
      pool = { size: Math.trunc(size), busy: Math.trunc(busy) };
    }
  }

  if (!pool || statusText !== "ok") {
    // Unknown shape or an engine that is still starting: never report healthy.
    return {
      status: statusText === "ok" ? "degraded" : "unavailable",
      engineVersion,
      arch,
      pool,
      latencyMs,
      detail: pool ? "Engine chưa sẵn sàng." : "Phản hồi /healthz không hợp lệ.",
    };
  }

  const busy = pool.busy >= pool.size;
  return {
    status: busy ? "degraded" : "healthy",
    engineVersion,
    arch,
    pool,
    latencyMs,
    detail: busy ? "Toàn bộ engine process đang bận." : "OK",
  };
}

export async function cloudEngineHealth(): Promise<CloudEngineHealth> {
  const creds = credentials();
  if (!creds) {
    return {
      status: "not_configured",
      engineVersion: null,
      arch: null,
      pool: null,
      latencyMs: null,
      detail: "Chưa cấu hình PLAY_ENGINE_URL / service account.",
    };
  }
  const startedAt = Date.now();
  const res = await call<unknown>("/healthz", {}, 8_000);
  if (!res.ok) {
    return {
      status: "unavailable",
      engineVersion: null,
      arch: null,
      pool: null,
      latencyMs: Date.now() - startedAt,
      detail: res.error,
    };
  }
  return interpretHealthPayload(res.data, Date.now() - startedAt);
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
  let last: BestMoveResult = { status: "unavailable", bestmove: null, ponder: null, depth: null, nodes: null, nps: null, timeMs: null, tbHits: null, engineVersion: null };
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
        moves: req.moves,
        options: uciOptions(config),
        search,
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
      bestmove: null, ponder: null, depth: null, nodes: null, nps: null, timeMs: null, tbHits: null,
      engineVersion: null,
      error: res.ok ? "missing_bestmove" : res.error,
    };
    if (!res.ok && res.status === "not_configured") break;
  }
  return last;
}

export interface BenchmarkRun {
  kind: "bench" | "speedtest" | "epd" | "positions" | "selfplay";
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
  options: { movetimeMs?: number; games?: number } = {},
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
      movetimeMs: options.movetimeMs ?? 1_000,
      games: options.games ?? 4,
    },
    Math.max(config.requestTimeoutMs, 120_000),
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
