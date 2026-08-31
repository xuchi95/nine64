/**
 * Nine64 Fair Play worker.
 *
 * Loop: claim bounded batch of analysis jobs -> replay canonical moves with a
 * server-side Stockfish -> post per-player observations back to the app. The
 * app performs the scoring and the writes with its service identity, so the
 * worker itself holds no database credentials and can never issue a sanction.
 *
 * Idempotency: results are keyed by job id; a retried job overwrites the same
 * (game, player) report instead of creating a second verdict.
 */
import http from "node:http";
import { createApiClient } from "./client.js";
import { createEngine, evaluateGame } from "./engine.js";
import { toObservations, spentMsFor } from "./observations.js";

const WORKER_NAME = process.env.FAIRPLAY_WORKER_NAME ?? "fairplay-worker";
const BATCH = Number(process.env.FAIRPLAY_BATCH_SIZE ?? 2);
const LEASE_SECONDS = Number(process.env.FAIRPLAY_LEASE_SECONDS ?? 600);
const IDLE_MS = Number(process.env.FAIRPLAY_IDLE_MS ?? 15000);
const DEPTH = Number(process.env.FAIRPLAY_DEPTH ?? 16);
const MOVE_TIME_MS = Number(process.env.FAIRPLAY_MOVE_TIME_MS ?? 250);
const MIN_MOVES = Number(process.env.FAIRPLAY_MIN_MOVES ?? 12);

export async function runOnce(api, engine) {
  const { jobs = [] } = await api.claim(WORKER_NAME, BATCH, LEASE_SECONDS);
  for (const job of jobs) {
    try {
      if (job.moves.length < MIN_MOVES) {
        await api.fail(job.jobId, "TOO_FEW_MOVES");
        continue;
      }
      const startedAt = Date.now();
      const plies = await evaluateGame(engine, {
        initialFen: job.game.initialFen,
        moves: job.moves,
      });
      const evalMs = Date.now() - startedAt;

      const subjects = [];
      for (const [color, userId] of [
        ["w", job.game.whiteId],
        ["b", job.game.blackId],
      ]) {
        const observations = toObservations(plies, color).map((o, i) => ({
          ...o,
          spentMs: o.spentMs ?? spentMsFor(job.moves, i, color),
        }));
        if (observations.length > 0) subjects.push({ userId, observations, evalMs });
      }
      if (subjects.length === 0) {
        await api.fail(job.jobId, "NO_OBSERVATIONS");
        continue;
      }

      await api.result({
        jobId: job.jobId,
        engineVersion: engine.version,
        depth: DEPTH,
        timeBudgetMs: MOVE_TIME_MS,
        subjects,
      });
    } catch (error) {
      await api.fail(job.jobId, error?.message ?? "WORKER_ERROR").catch(() => {});
    }
  }
  return jobs.length;
}

async function main() {
  const api = createApiClient({
    baseUrl: process.env.FAIRPLAY_APP_URL,
    audience: process.env.FAIRPLAY_AUDIENCE ?? process.env.FAIRPLAY_APP_URL,
  });
  const engine = await createEngine({ depth: DEPTH, moveTimeMs: MOVE_TIME_MS, multiPv: 2 });

  // Cloud Run requires a listening port even for a pull-based worker.
  http
    .createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, worker: WORKER_NAME, engine: engine.version }));
    })
    .listen(Number(process.env.PORT ?? 8080));

  for (;;) {
    let processed = 0;
    try {
      processed = await runOnce(api, engine);
    } catch (error) {
      console.error("[fairplay-worker] loop error", error?.message ?? error);
    }
    if (processed === 0) await new Promise((r) => setTimeout(r, IDLE_MS));
  }
}

if (process.env.NODE_ENV !== "test" && process.argv[1]?.endsWith("index.js")) {
  main().catch((error) => {
    console.error("[fairplay-worker] fatal", error);
    process.exit(1);
  });
}
