/**
 * Nine64 play-engine — private HTTP wrapper around official Stockfish 18.
 *
 * Security model: the service is deployed as a PRIVATE Cloud Run service and
 * only accepts Google-signed OIDC ID tokens from the Nine64 backend service
 * account. It is never reachable from a browser, and it does not implement a
 * general "give me the best move for any FEN" public API.
 *
 * Copyright (C) 2026 Nine64. GPL-3.0-or-later (see LICENSE / README).
 */
import http from "node:http";
import os from "node:os";
import { EnginePool } from "./pool.js";
import { VARIANTS, createPosition, decodeEngineMove, isLegal } from "./rules.js";
import { verifyIdToken } from "./auth.js";
import {
  EPD_SUITE,
  POSITION_SUITE,
  runSuite,
  suiteMovetime,
  suiteRequestTimeout,
  validateSuite,
} from "./benchmark.js";
import {
  BENCHMARK_SUITE_VERSION,
  SERVICE_BUILD_ID,
  capabilities,
  inspectSyzygy,
  syzygyPath,
} from "./capabilities.js";

const PORT = Number(process.env.PORT || 8080);
/**
 * UCI options a CALLER may set. `SyzygyPath` is deliberately absent: a
 * filesystem path must never be controlled from outside the container. The
 * service injects the real path itself, and only when tablebase files exist.
 */
const ALLOWED_OPTIONS = new Set([
  "Threads",
  "Hash",
  "MultiPV",
  "Skill Level",
  "UCI_LimitStrength",
  "UCI_Elo",
  "Move Overhead",
  "Ponder",
  "SyzygyProbeLimit",
  "UCI_Chess960",
]);

const pool = new EnginePool();
let ready = false;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(payload);
}

function sanitizeOptions(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (!ALLOWED_OPTIONS.has(key)) continue;
    if (typeof value === "boolean") out[key] = value ? "true" : "false";
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = String(Math.trunc(value));
    else if (typeof value === "string" && /^[\w\-./: ]{1,120}$/.test(value)) out[key] = value;
  }
  return out;
}

/**
 * Server-owned Syzygy options. A caller can ask for probing, but the path and
 * the advertised piece count come from what is really installed on disk.
 */
export function syzygyOptions(requested = {}, tb = inspectSyzygy(), path = syzygyPath()) {
  const wants = Number(requested["SyzygyProbeLimit"] ?? 0);
  if (!tb.ready || !path || !(wants > 0)) return {};
  return { SyzygyPath: path, SyzygyProbeLimit: String(Math.min(Math.trunc(wants), tb.pieces)) };
}

/**
 * Rejects a configuration that does not fit the container instead of silently
 * clamping it. Returns a reason string, or null when the config fits.
 */
export function resourceMismatch(options, caps = capabilities(pool.size)) {
  const threads = Number(options["Threads"] ?? 0);
  const hash = Number(options["Hash"] ?? 0);
  if (threads > caps.maxThreadsPerEngine) return `threads>${caps.maxThreadsPerEngine}`;
  if (hash > caps.maxSafeHashMb) return `hash>${caps.maxSafeHashMb}`;
  return null;
}

/**
 * Builds the native `go` arguments.
 *
 * In clock mode Stockfish MUST manage its own time: `wtime/btime/winc/binc`
 * only. Adding `movetime` here would replace Stockfish's time manager with a
 * flat per-move budget and measurably weaken play, so the caller's
 * `maxMoveTimeMs` is applied as an outer hard stop instead (see `hardStopFor`).
 */
function buildGoArgs(body) {
  // The backend sends a typed `search` block; legacy top-level fields stay supported.
  const search = body.search && typeof body.search === "object" ? body.search : {};
  const policy = typeof search.policy === "string" ? search.policy : null;

  if (policy === "depth" && Number.isFinite(Number(search.depth))) {
    return `depth ${Math.min(Math.max(Math.trunc(Number(search.depth)), 1), 60)}`;
  }
  if (policy === "nodes" && Number.isFinite(Number(search.nodes))) {
    return `nodes ${Math.min(Math.max(Math.trunc(Number(search.nodes)), 1), 1_000_000_000)}`;
  }

  const clock = readClock(body);
  if (clock) {
    const parts = [
      `wtime ${Math.max(1, Math.trunc(clock.whiteMs))}`,
      `btime ${Math.max(1, Math.trunc(clock.blackMs))}`,
    ];
    if (clock.whiteIncMs) parts.push(`winc ${Math.trunc(clock.whiteIncMs)}`);
    if (clock.blackIncMs) parts.push(`binc ${Math.trunc(clock.blackIncMs)}`);
    return parts.join(" ");
  }

  const requested = Number(search.movetimeMs) || Number(body.movetimeMs) || 3000;
  const movetime = Math.min(Math.max(requested, 50), 60_000);
  return `movetime ${movetime}`;
}

function readClock(body) {
  const search = body.search && typeof body.search === "object" ? body.search : {};
  if (body.clock && Number.isFinite(body.clock.whiteMs) && Number.isFinite(body.clock.blackMs)) return body.clock;
  if (Number.isFinite(Number(search.wtimeMs)) && Number.isFinite(Number(search.btimeMs))) {
    return {
      whiteMs: Number(search.wtimeMs),
      blackMs: Number(search.btimeMs),
      whiteIncMs: Number(search.wincMs) || 0,
      blackIncMs: Number(search.bincMs) || 0,
    };
  }
  return null;
}

/** Outer safety cap in ms, or null when the search is already bounded. */
export function hardStopFor(body) {
  if (!readClock(body)) return null;
  const search = body.search && typeof body.search === "object" ? body.search : {};
  const cap = Number(search.maxMoveTimeMs);
  if (!Number.isFinite(cap) || cap <= 0) return null;
  return Math.min(Math.trunc(cap), 120_000);
}



async function readBody(req, limit = 256 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("payload_too_large");
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function handleBestMove(body) {
  if (typeof body.fen !== "string") return { status: 400, payload: { error: "fen_required" } };
  const variant = typeof body.variant === "string" ? body.variant : "standard";
  if (!VARIANTS.has(variant)) return { status: 400, payload: { error: "unknown_variant" } };
  const moves = Array.isArray(body.moves) ? body.moves.filter((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)) : [];

  // Validate the position locally, with the CORRECT variant rules, before
  // spending engine time on it.
  let chess;
  try {
    chess = createPosition(variant, body.fen);
    for (const uci of moves) {
      const decoded = decodeEngineMove(variant, chess.fen(), uci);
      const move =
        decoded &&
        chess.move({
          from: decoded.from,
          to: decoded.to,
          ...(decoded.promotion ? { promotion: decoded.promotion } : {}),
        });
      if (!move) throw new Error("illegal");
    }
  } catch {
    return { status: 400, payload: { error: "invalid_position" } };
  }

  const timeoutMs = Math.min(Math.max(Number(body.timeoutMs) || 30_000, 1_000), 120_000);
  const requested = sanitizeOptions(body.options);
  // A caller may ASK for tablebase probing, but never controls the effective
  // probe limit or path: only `syzygyOptions()` may re-add them, and only when
  // real tablebase files are installed.
  const wantsSyzygy = requested["SyzygyProbeLimit"];
  const safeOptions = { ...requested };
  delete safeOptions["SyzygyProbeLimit"];
  const mismatch = resourceMismatch(safeOptions);
  if (mismatch) {
    return { status: 422, payload: { error: "config_resource_mismatch", detail: mismatch } };
  }
  try {
    const result = await pool.search({
      fen: body.fen,
      moves,
      // Set on EVERY search so a Chess960 request can never leave a pooled
      // engine process in 960 mode for the next standard request.
      options: {
        ...safeOptions,
        ...syzygyOptions({ SyzygyProbeLimit: wantsSyzygy }),
        UCI_Chess960: variant === "chess960" ? "true" : "false",
      },
      goArgs: buildGoArgs(body),
      timeoutMs,
      hardStopMs: hardStopFor(body),
      newGame: Boolean(body.newGame),
    });

    if (!result.bestmove) return { status: 409, payload: { error: "no_move" } };
    // The engine's move must be legal in the resulting position. For Chess960
    // it is decoded out of Stockfish notation first — legality checking is
    // never disabled to make the engine's encoding "fit".
    const check = createPosition(variant, chess.fen());
    const decoded = decodeEngineMove(variant, chess.fen(), result.bestmove);
    const legal = Boolean(decoded) && isLegal(check, decoded);
    if (!legal) {
      pool.stats.illegal += 1;
      return { status: 500, payload: { error: "illegal_bestmove" } };
    }
    return { status: 200, payload: result };
  } catch (err) {
    const code = err.message === "timeout" ? "timeout" : err.message === "pool_busy" ? "busy" : "engine_error";
    return { status: code === "busy" ? 429 : 504, payload: { error: code } };
  }
}

async function handleBenchmark(body) {
  const kind = String(body.kind || "bench");
  if (kind === "bench" || kind === "speedtest") {
    const result = await pool.bench();
    return {
      status: 200,
      payload: {
        engineVersion: result.engineVersion,
        nodes: result.nodes,
        nps: result.nps,
        passed: Boolean(result.nps),
        suiteVersion: BENCHMARK_SUITE_VERSION,
        detail: {
          kind,
          suiteVersion: BENCHMARK_SUITE_VERSION,
          hardware: { threads: Number(process.env.ENGINE_THREADS || 0) || null },
          failureReasons: result.nps ? [] : ["engine_error"],
        },
      },
    };
  }
  if (kind === "epd" || kind === "positions") {
    const suite = kind === "epd" ? EPD_SUITE : POSITION_SUITE;
    // A malformed suite must fail loudly rather than score the engine wrongly.
    const problems = validateSuite(suite);
    if (problems.length) {
      return { status: 500, payload: { error: "invalid_suite", detail: problems.slice(0, 5) } };
    }
    const movetimeMs = suiteMovetime(kind, body.movetimeMs);
    const timeoutMs = suiteRequestTimeout(movetimeMs);
    const requested = sanitizeOptions(body.options);
    // Caller-supplied probe limits never reach the engine directly.
    const wantsSyzygy = requested["SyzygyProbeLimit"];
    const options = { ...requested };
    delete options["SyzygyProbeLimit"];
    const run = await runSuite({
      kind,
      suite,
      movetimeMs,
      engineVersion: pool.engineVersion,
      // Sequential by construction (see runSuite): a pool of size 1 is never
      // asked to run two positions concurrently.
      search: (entry) =>
        pool.search({
          fen: entry.fen,
          options: {
            ...options,
            ...syzygyOptions({ SyzygyProbeLimit: wantsSyzygy }),
            // Explicit on EVERY search: a 960 entry must not leak into the
            // next standard entry on a reused process.
            UCI_Chess960: entry.variant === "chess960" ? "true" : "false",
          },
          goArgs: `movetime ${movetimeMs}`,
          timeoutMs,
          newGame: true,
        }),
    });
    pool.stats.illegal += Number(run.detail.illegalMoves || 0);
    const tb = inspectSyzygy();
    return {
      status: 200,
      payload: {
        kind,
        engineVersion: run.engineVersion ?? pool.engineVersion,
        depth: run.depth,
        score: run.score,
        passed: run.passed,
        suiteVersion: BENCHMARK_SUITE_VERSION,
        serviceBuildId: SERVICE_BUILD_ID,
        detail: {
          ...run.detail,
          movetimeMs,
          suiteVersion: BENCHMARK_SUITE_VERSION,
          serviceBuildId: SERVICE_BUILD_ID,
          syzygyReady: tb.ready,
        },
      },
    };
  }
  return { status: 400, payload: { error: "unknown_kind", kind } };
}


/**
 * Stable, typed /health payload. `busy` is derived from the real engine
 * process states, never from a static number. Never contains credentials,
 * filesystem paths or environment values.
 */
export function healthPayload(enginePool, isReady) {
  const engines = Array.isArray(enginePool?.engines) ? enginePool.engines : [];
  const alive = engines.filter((e) => !e.dead);
  const stats = enginePool?.stats ?? {};
  const size = Number(enginePool?.size ?? alive.length) || alive.length;
  return {
    status: isReady ? "ok" : "starting",
    engineVersion: enginePool?.engineVersion ?? null,
    arch: process.env.ENGINE_ARCH || os.arch() || null,
    pool: { size, busy: alive.filter((e) => e.busy).length },
    capabilities: capabilities(size || 1),
    benchmarkSuiteVersion: BENCHMARK_SUITE_VERSION,
    stats: {
      searches: Number(stats.searches ?? 0),
      timeouts: Number(stats.timeouts ?? 0),
      restarts: Number(stats.restarts ?? 0),
      illegal: Number(stats.illegal ?? 0),
      hardStops: Number(stats.hardStops ?? 0),
    },
  };
}


const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/health") {
    return json(res, ready ? 200 : 503, healthPayload(pool, ready));
  }

  const auth = await verifyIdToken(req.headers.authorization);
  if (!auth.ok) return json(res, 401, { error: auth.error });

  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 413, { error: "payload_too_large" });
  }

  const correlationId = String(body.requestId || req.headers["x-correlation-id"] || "-").slice(0, 80);
  const started = Date.now();
  let out;
  if (url.pathname === "/bestmove") out = await handleBestMove(body);
  else if (url.pathname === "/benchmark") out = await handleBenchmark(body);
  else out = { status: 404, payload: { error: "not_found" } };

  // Structured log; never contains tokens or credentials.
  console.log(
    JSON.stringify({
      path: url.pathname,
      status: out.status,
      ms: Date.now() - started,
      correlationId,
      caller: auth.email ?? null,
    }),
  );
  return json(res, out.status, out.payload);
});

if (process.env.NODE_ENV !== "test") {
  pool
    .init()
    .then(() => {
      ready = true;
      // Safe startup diagnostics: hardware shape only, no paths or secrets.
      console.log(JSON.stringify({ msg: "engine_ready", capabilities: capabilities(pool.size) }));
      server.listen(PORT, () => console.log(JSON.stringify({ msg: "play-engine listening", port: PORT })));
    })

    .catch((err) => {
      console.error(JSON.stringify({ msg: "engine_start_failed", error: err.message }));
      process.exit(1);
    });
}

export { server, pool, sanitizeOptions, buildGoArgs, handleBestMove, handleBenchmark };
