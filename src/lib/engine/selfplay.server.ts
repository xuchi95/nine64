/**
 * Titan self-play regression: candidate draft vs the currently published live
 * config, on the same Cloud Run Stockfish 18 process.
 *
 * Honest by construction:
 *  - both sides are real engine searches through `/bestmove`; nothing is
 *    simulated, randomised or estimated,
 *  - colours alternate so a first-move advantage cannot flatter the candidate,
 *  - no Elo is claimed — only wins/draws/losses plus both config fingerprints,
 *  - any illegal move, missing move or transport error fails the run closed.
 */
import { Chess } from "chess.js";
import type { EngineConfig } from "./profileTypes";
import type { BenchmarkRow, Json } from "./benchmarkTypes";
import { engineConfigFingerprint } from "./configFingerprint";
import { QUALIFICATION_SUITE_VERSION } from "./benchmarks.server";
import type { SelfPlayGame, SelfPlayRegression } from "./selfplayTypes";

export type { SelfPlayGame, SelfPlayRegression };

/** Bounded search settings — the regression must finish inside one admin request. */
function probeConfig(config: EngineConfig, moveTimeMs: number): EngineConfig {
  return {
    ...config,
    timePolicy: "movetime",
    moveTimeMs,
    maxMoveTimeMs: moveTimeMs,
    requestTimeoutMs: Math.min(120_000, Math.max(config.requestTimeoutMs, moveTimeMs + 12_000)),
    maxRetries: 0,
    ponder: false,
  };
}

function terminationOf(chess: Chess): string {
  if (chess.isCheckmate()) return "checkmate";
  if (chess.isStalemate()) return "stalemate";
  if (chess.isThreefoldRepetition()) return "threefold";
  if (chess.isInsufficientMaterial()) return "insufficient_material";
  if (chess.isDraw()) return "fifty_move_or_draw";
  return "ply_limit";
}

async function playGame(args: {
  index: number;
  candidateColor: "white" | "black";
  candidate: EngineConfig;
  baseline: EngineConfig;
  maxPlies: number;
}): Promise<{ game: SelfPlayGame; engineVersion: string | null }> {
  const { requestBestMove } = await import("./cloudEngine.server");
  const chess = new Chess();
  let engineVersion: string | null = null;
  const sessionPrefix = `selfplay-${args.index}-${crypto.randomUUID()}`;

  for (let ply = 0; ply < args.maxPlies; ply += 1) {
    if (chess.isGameOver()) break;
    const sideToMove = chess.turn() === "w" ? "white" : "black";
    const isCandidate = sideToMove === args.candidateColor;
    const fen = chess.fen();
    const result = await requestBestMove({
      fen,
      variant: "standard",
      config: isCandidate ? args.candidate : args.baseline,
      clock: null,
      sessionId: `${sessionPrefix}-${isCandidate ? "cand" : "base"}`,
      requestId: crypto.randomUUID(),
      newGame: ply === 0,
    });
    engineVersion = result.engineVersion ?? engineVersion;
    if (result.status !== "ok" || !result.bestmove) {
      return {
        game: {
          index: args.index,
          candidateColor: args.candidateColor,
          result: "error",
          plies: ply,
          termination: "aborted",
          error: result.status === "ok" ? "no_move" : result.status,
        },
        engineVersion,
      };
    }
    const uci = result.bestmove;
    let applied: unknown = null;
    try {
      applied = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci[4] ? { promotion: uci[4] } : {}),
      });
    } catch {
      applied = null;
    }
    if (!applied) {
      return {
        game: {
          index: args.index,
          candidateColor: args.candidateColor,
          result: "error",
          plies: ply,
          termination: "aborted",
          error: "illegal_move",
        },
        engineVersion,
      };
    }
  }

  const termination = terminationOf(chess);
  let outcome: SelfPlayGame["result"] = "draw";
  if (chess.isCheckmate()) {
    // Side to move is mated: the other side won.
    const loser = chess.turn() === "w" ? "white" : "black";
    outcome = loser === args.candidateColor ? "baseline_win" : "candidate_win";
  }
  return {
    game: {
      index: args.index,
      candidateColor: args.candidateColor,
      result: outcome,
      plies: chess.history().length,
      termination,
      error: null,
    },
    engineVersion,
  };
}

/**
 * Run the regression and persist one `selfplay` benchmark row. The row is
 * recorded under the CANDIDATE fingerprint; the baseline fingerprint lives in
 * the result payload so the pairing is always auditable.
 */
export async function runSelfPlayRegression(args: {
  slug: string;
  candidate: EngineConfig;
  actorId: string;
  games?: number;
  moveTimeMs?: number;
  maxPlies?: number;
}): Promise<SelfPlayRegression> {
  const { getEngineProfile, titanProfile } = await import("./profiles.server");
  const { cloudEngineConfigured } = await import("./cloudEngine.server");

  const startedAt = Date.now();
  const gamesCount = Math.min(Math.max(args.games ?? 4, 2), 10);
  const moveTimeMs = Math.min(Math.max(args.moveTimeMs ?? 250, 100), 2_000);
  const maxPlies = Math.min(Math.max(args.maxPlies ?? 120, 20), 300);
  const profile = (await getEngineProfile(args.slug)) ?? (await titanProfile());
  const baseline = profile.config;
  const candidateSignature = await engineConfigFingerprint(args.candidate);
  const baselineSignature = await engineConfigFingerprint(baseline);

  const empty = (code: string): SelfPlayRegression => ({
    ok: false,
    code,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    errors: 0,
    score: null,
    candidateSignature,
    baselineSignature,
    baselineVersion: profile.version,
    engineVersion: null,
    moveTimeMs,
    maxPlies,
    durationMs: Date.now() - startedAt,
    detail: [],
    benchmarkId: null,
  });

  if (!cloudEngineConfigured()) return empty("ENGINE_NOT_CONFIGURED");

  const candidateProbe = probeConfig(args.candidate, moveTimeMs);
  const baselineProbe = probeConfig(baseline, moveTimeMs);
  const detail: SelfPlayGame[] = [];
  let engineVersion: string | null = null;

  for (let index = 0; index < gamesCount; index += 1) {
    const played = await playGame({
      index,
      candidateColor: index % 2 === 0 ? "white" : "black",
      candidate: candidateProbe,
      baseline: baselineProbe,
      maxPlies,
    });
    engineVersion = played.engineVersion ?? engineVersion;
    detail.push(played.game);
    // Fail closed: an engine error invalidates the pairing, do not keep burning
    // Cloud Run time on a broken deployment.
    if (played.game.result === "error") break;
  }

  const wins = detail.filter((g) => g.result === "candidate_win").length;
  const losses = detail.filter((g) => g.result === "baseline_win").length;
  const draws = detail.filter((g) => g.result === "draw").length;
  const errors = detail.filter((g) => g.result === "error").length;
  const completed = wins + losses + draws;
  const supportedVersion = /stockfish\s*18/i.test(engineVersion ?? "");
  const ok = errors === 0 && completed === gamesCount && supportedVersion;
  const score = completed ? (wins + draws / 2) / completed : null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result: Record<string, Json> = {
    kind: "selfplay",
    mode: "regression_selfplay",
    suiteVersion: QUALIFICATION_SUITE_VERSION,
    candidateSignature,
    baselineSignature,
    baselineVersion: profile.version,
    games: gamesCount,
    completed,
    wins,
    draws,
    losses,
    errors,
    moveTimeMs,
    maxPlies,
    durationMs: Date.now() - startedAt,
    detail: detail as unknown as Json,
    failureReasons: ok
      ? []
      : [
          ...(errors ? ["engine_error"] : []),
          ...(completed !== gamesCount ? ["incomplete_match"] : []),
          ...(!supportedVersion ? ["engine_version_unsupported"] : []),
        ],
  };
  const { data } = await supabaseAdmin
    .from("engine_benchmarks")
    .insert({
      profile_slug: profile.slug,
      profile_version: profile.version,
      kind: "selfplay",
      engine_version: engineVersion ?? "unknown",
      hardware: {} as never,
      nodes: null,
      nps: null,
      depth: null,
      score,
      passed: ok,
      result: result as never,
      signature: engineVersion ?? null,
      config_signature: candidateSignature,
      suite_version: QUALIFICATION_SUITE_VERSION,
      created_by: args.actorId,
    } as never)
    .select("id")
    .single();

  return {
    ok,
    code: ok ? null : (errors ? "ENGINE_ERROR" : !supportedVersion ? "ENGINE_VERSION_UNSUPPORTED" : "INCOMPLETE"),
    games: gamesCount,
    wins,
    draws,
    losses,
    errors,
    score,
    candidateSignature,
    baselineSignature,
    baselineVersion: profile.version,
    engineVersion,
    moveTimeMs,
    maxPlies,
    durationMs: Date.now() - startedAt,
    detail,
    benchmarkId: data ? String((data as Record<string, unknown>)["id"]) : null,
  };
}

export type { BenchmarkRow };
