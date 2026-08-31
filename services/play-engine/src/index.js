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
import { Chess } from "chess.js";
import { EnginePool } from "./pool.js";
import { verifyIdToken } from "./auth.js";

const PORT = Number(process.env.PORT || 8080);
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
  "SyzygyPath",
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

function buildGoArgs(body) {
  const clock = body.clock;
  if (clock && Number.isFinite(clock.whiteMs) && Number.isFinite(clock.blackMs)) {
    const parts = [
      `wtime ${Math.max(1, Math.trunc(clock.whiteMs))}`,
      `btime ${Math.max(1, Math.trunc(clock.blackMs))}`,
    ];
    if (clock.whiteIncMs) parts.push(`winc ${Math.trunc(clock.whiteIncMs)}`);
    if (clock.blackIncMs) parts.push(`binc ${Math.trunc(clock.blackIncMs)}`);
    return parts.join(" ");
  }
  const movetime = Math.min(Math.max(Number(body.movetimeMs) || 3000, 50), 60_000);
  return `movetime ${movetime}`;
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
  const moves = Array.isArray(body.moves) ? body.moves.filter((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)) : [];

  // Validate the position locally before spending engine time on it.
  let chess;
  try {
    chess = new Chess(body.fen);
    for (const uci of moves) {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci.length > 4 ? { promotion: uci[4] } : {}),
      });
      if (!move) throw new Error("illegal");
    }
  } catch {
    return { status: 400, payload: { error: "invalid_position" } };
  }

  const timeoutMs = Math.min(Math.max(Number(body.timeoutMs) || 30_000, 1_000), 120_000);
  try {
    const result = await pool.search({
      fen: body.fen,
      moves,
      options: sanitizeOptions(body.options),
      goArgs: buildGoArgs(body),
      timeoutMs,
      newGame: Boolean(body.newGame),
    });
    if (!result.bestmove) return { status: 409, payload: { error: "no_move" } };
    // The engine's move must be legal in the resulting position.
    const check = new Chess(chess.fen());
    const legal = check.moves({ verbose: true }).some((m) => {
      const uci = `${m.from}${m.to}${m.promotion ?? ""}`;
      return uci === result.bestmove;
    });
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
        detail: { kind, hardware: { threads: Number(process.env.ENGINE_THREADS || 0) || null } },
      },
    };
  }
  if (kind === "epd" || kind === "positions") {
    const suite = kind === "epd" ? EPD_SUITE : POSITION_SUITE;
    let solved = 0;
    let illegal = 0;
    let depth = 0;
    for (const entry of suite) {
      try {
        const res = await pool.search({
          fen: entry.fen,
          options: sanitizeOptions(body.options),
          goArgs: `movetime ${Math.min(Number(body.movetimeMs) || 1000, 10_000)}`,
          timeoutMs: 30_000,
          newGame: true,
        });
        depth = Math.max(depth, res.depth ?? 0);
        if (!res.bestmove) illegal += 1;
        else if (!entry.best || res.bestmove.startsWith(entry.best)) solved += 1;
      } catch {
        illegal += 1;
      }
    }
    return {
      status: 200,
      payload: {
        engineVersion: pool.engineVersion,
        depth,
        score: suite.length ? solved / suite.length : 0,
        passed: illegal === 0 && solved >= Math.ceil(suite.length * 0.8),
        detail: { kind, solved, total: suite.length, illegalMoves: illegal },
      },
    };
  }
  return { status: 400, payload: { error: "unknown_kind" } };
}

const EPD_SUITE = [
  { fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", best: "a1a8" },
  { fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4", best: "f3f7" },
  { fen: "2r3k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 1", best: "c1c8" },
];

const POSITION_SUITE = [
  { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", best: null },
  { fen: "r1bq1rk1/pp2ppbp/2np1np1/8/2BNP3/2N1B3/PPP2PPP/R2QK2R w KQ - 0 9", best: null },
  { fen: "8/8/8/4k3/8/4K3/4P3/8 w - - 0 1", best: null },
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/healthz") {
    return json(res, ready ? 200 : 503, {
      status: ready ? "ok" : "starting",
      engineVersion: pool.engineVersion,
      pool: pool.engines?.length ?? 0,
      stats: pool.stats,
    });
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
      server.listen(PORT, () => console.log(JSON.stringify({ msg: "play-engine listening", port: PORT })));
    })
    .catch((err) => {
      console.error(JSON.stringify({ msg: "engine_start_failed", error: err.message }));
      process.exit(1);
    });
}

export { server, pool, sanitizeOptions, buildGoArgs, handleBestMove };
