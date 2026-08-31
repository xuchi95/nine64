/**
 * Trusted Fair Play worker API.
 *
 * The worker never talks to the database directly: it authenticates with a
 * Google-signed OIDC ID token and this module performs every write with the
 * server-side service identity. Canonical moves are read from the move ledger,
 * so a caller can never smuggle a fabricated PGN/FEN into the analysis.
 */
import { z } from "zod";
import { evaluateGame } from "./evaluate";
import { loadTurns, refreshStatus } from "./apply.server";
import type { MoveObservation } from "./types";

const CLAIM_SCHEMA = z.object({
  worker: z.string().min(1).max(100),
  limit: z.number().int().min(1).max(20).default(3),
  leaseSeconds: z.number().int().min(30).max(1800).default(300),
});

const OBSERVATION_SCHEMA = z.object({
  ply: z.number().int().min(0),
  isTop1: z.boolean(),
  loss: z.number().min(0).max(100),
  complexity: z.number().min(0).max(1),
  accuracy: z.number().min(0).max(100),
  spentMs: z.number().min(0).max(3_600_000).nullable().default(null),
});

const RESULT_SCHEMA = z.object({
  jobId: z.string().uuid(),
  engineVersion: z.string().min(1).max(100),
  depth: z.number().int().min(1).max(60),
  timeBudgetMs: z.number().int().min(1).max(600_000),
  subjects: z
    .array(
      z.object({
        userId: z.string().uuid(),
        observations: z.array(OBSERVATION_SCHEMA).min(1).max(400),
        evalMs: z.number().int().min(0).max(3_600_000).default(0),
      }),
    )
    .min(1)
    .max(2),
});

const FAIL_SCHEMA = z.object({ jobId: z.string().uuid(), error: z.string().min(1).max(1000) });

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function claimJobs(body: unknown) {
  const input = CLAIM_SCHEMA.parse(body);
  const db = await admin();
  const { data, error } = await db.rpc("fairplay_claim_jobs", {
    _worker: input.worker,
    _limit: input.limit,
    _lease_seconds: input.leaseSeconds,
  });
  if (error) throw new Error(error.message);

  const jobs = data ?? [];
  const payload = [];
  for (const job of jobs) {
    const [{ data: game }, { data: moves }] = await Promise.all([
      db
        .from("games")
        .select("id, white_id, black_id, white_rating, black_rating, initial_fen, result, time_control")
        .eq("id", job.game_id)
        .maybeSingle(),
      db
        .from("game_moves")
        .select("move_number, san, uci, fen, white_time_ms, black_time_ms")
        .eq("game_id", job.game_id)
        .order("move_number", { ascending: true }),
    ]);
    if (!game) {
      await db.rpc("fairplay_fail_job", { _job_id: job.id, _error: "GAME_NOT_FOUND" });
      continue;
    }
    payload.push({
      jobId: job.id,
      analyzerVersion: job.analyzer_version,
      attempts: job.attempts,
      game: {
        id: game.id,
        whiteId: game.white_id,
        blackId: game.black_id,
        whiteRating: game.white_rating,
        blackRating: game.black_rating,
        initialFen: game.initial_fen,
        result: game.result,
        timeControl: game.time_control,
      },
      // Canonical move ledger — the only source of truth for the analysis.
      moves: (moves ?? []).map((m) => ({
        ply: m.move_number,
        san: m.san,
        uci: m.uci,
        fen: m.fen,
        whiteTimeMs: m.white_time_ms,
        blackTimeMs: m.black_time_ms,
      })),
    });
  }
  return { jobs: payload };
}

export async function submitResult(body: unknown) {
  const input = RESULT_SCHEMA.parse(body);
  const db = await admin();

  const { data: job } = await db
    .from("fairplay_jobs")
    .select("id, game_id, status")
    .eq("id", input.jobId)
    .maybeSingle();
  if (!job) return { ok: false as const, code: "JOB_NOT_FOUND" };

  const { data: game } = await db
    .from("games")
    .select("id, white_id, black_id, white_rating, black_rating")
    .eq("id", job.game_id)
    .maybeSingle();
  if (!game) return { ok: false as const, code: "GAME_NOT_FOUND" };

  const subjects = [];
  for (const subject of input.subjects) {
    if (subject.userId !== game.white_id && subject.userId !== game.black_id) continue;
    const rating = subject.userId === game.white_id ? game.white_rating : game.black_rating;
    const turns = await loadTurns(db, game.id, subject.userId);
    const verdict = evaluateGame({
      observations: subject.observations as MoveObservation[],
      turns,
      rating,
    });
    subjects.push({
      user_id: subject.userId,
      score: verdict.score,
      probability: verdict.probability,
      confidence: verdict.confidence,
      features: verdict.features,
      contributions: verdict.contributions,
      reasons: verdict.reasons,
      eval_ms: subject.evalMs,
    });
  }
  if (subjects.length === 0) return { ok: false as const, code: "NO_VALID_SUBJECT" };

  const { data, error } = await db.rpc("fairplay_submit_analysis", {
    _job_id: input.jobId,
    _engine_version: input.engineVersion,
    _depth: input.depth,
    _time_budget_ms: input.timeBudgetMs,
    _subjects: JSON.parse(JSON.stringify(subjects)) as never,
  });
  if (error) throw new Error(error.message);

  // Aggregate status only — machine evidence never locks a rating by itself.
  for (const subject of subjects) {
    await refreshStatus(db, subject.user_id, { autoLock: false });
  }

  return { ok: true as const, result: data };
}

export async function failJob(body: unknown) {
  const input = FAIL_SCHEMA.parse(body);
  const db = await admin();
  const { data, error } = await db.rpc("fairplay_fail_job", {
    _job_id: input.jobId,
    _error: input.error,
  });
  if (error) throw new Error(error.message);
  return { ok: true as const, result: data };
}
