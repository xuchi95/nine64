/**
 * Engine benchmarks.
 *
 * Every stored row records the real engine version, profile version, hardware
 * reported by the service and the raw result. Nothing here invents NPS or Elo
 * numbers: when the cloud service is not configured the run simply fails with
 * `not_configured`.
 */
import { TITAN_SLUG } from "./profileTypes";
import { BENCHMARK_KINDS, type BenchmarkKind, type BenchmarkRow, type Json } from "./benchmarkTypes";
import { evaluateReadiness, type ReadinessResult } from "./readiness";
import { engineConfigFingerprint } from "./configFingerprint";
import type { EngineConfig } from "./profileTypes";
import { Chess } from "chess.js";
import { EXPECTED_BENCHMARK_SUITE_VERSION, checkEngineContract } from "./engineContract.server";

export { EXPECTED_BENCHMARK_SUITE_VERSION };

export { evaluateReadiness, latestBenchmarkByKind } from "./readiness";
export { engineConfigFingerprint, canonicalConfigJson } from "./configFingerprint";

export { BENCHMARK_KINDS };
export type { BenchmarkKind, BenchmarkRow };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function listBenchmarks(
  slug = TITAN_SLUG,
  limit = 50,
  configSignature?: string | null,
): Promise<BenchmarkRow[]> {
  const db = await admin();
  let query = db
    .from("engine_benchmarks")
    .select("*")
    .eq("profile_slug", slug)
    .order("created_at", { ascending: false });
  if (configSignature) query = query.eq("config_signature", configSignature);
  const { data } = await query.limit(Math.min(Math.max(limit, 1), 500));
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row["id"]),
      profileSlug: String(row["profile_slug"]),
      profileVersion: Number(row["profile_version"]),
      kind: row["kind"] as BenchmarkKind,
      engineVersion: String(row["engine_version"]),
      hardware: (row["hardware"] ?? {}) as Record<string, Json>,
      nodes: row["nodes"] === null ? null : Number(row["nodes"]),
      nps: row["nps"] === null ? null : Number(row["nps"]),
      depth: row["depth"] === null ? null : Number(row["depth"]),
      score: row["score"] === null ? null : Number(row["score"]),
      passed: Boolean(row["passed"]),
      result: (row["result"] ?? {}) as Record<string, Json>,
      configSignature: row["config_signature"] === null || row["config_signature"] === undefined
        ? null
        : String(row["config_signature"]),
      suiteVersion: row["suite_version"] ? String(row["suite_version"]) : null,
      createdAt: String(row["created_at"]),
    };
  });
}

export interface BenchmarkOutcome {
  ok: boolean;
  code?: string;
  row?: BenchmarkRow;
}

/**
 * Identity of the qualification suite the backend REQUIRES.
 *
 * The tactical/position suites themselves live in `services/play-engine`
 * (single source of truth). This constant only expresses what the backend
 * accepts: preflight refuses to run when the deployed engine reports a
 * different suite, so a row can never claim a suite the engine does not ship.
 */
export const QUALIFICATION_SUITE_VERSION = EXPECTED_BENCHMARK_SUITE_VERSION;

const PERFORMANCE_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type Probe = {
  fen: string;
  moves: readonly string[];
  variant?: "standard" | "chess960";
};

const TRANSIENT_STATUSES = new Set(["timeout", "unavailable"]);


export function isLegalBenchmarkMove(fen: string, uci: string | null): boolean {
  if (!uci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return false;
  try {
    const chess = new Chess(fen);
    const promotion = uci[4];
    return Boolean(chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(promotion ? { promotion } : {}),
    }));
  } catch {
    return false;
  }
}

/**
 * Bounded PERFORMANCE probe for `bench`/`speedtest` only.
 *
 * Cloud Run terminates Stockfish's native `bench` command at its request
 * ceiling, so throughput health is measured through the real `/bestmove` path
 * instead. This path contains NO tactical scoring: EPD and positions are
 * scored exclusively by the canonical service-side suite.
 */
async function runBoundedBenchmark(kind: "bench" | "speedtest", config: EngineConfig) {
  const { requestBestMove } = await import("./cloudEngine.server");
  const probe: Probe = { fen: PERFORMANCE_FEN, moves: [] };
  const movetimeMs = kind === "speedtest" ? 750 : 2_000;
  const probeConfig: EngineConfig = {
    ...config,
    timePolicy: "movetime",
    moveTimeMs: movetimeMs,
    maxMoveTimeMs: movetimeMs,
    requestTimeoutMs: Math.min(120_000, Math.max(config.requestTimeoutMs, movetimeMs + 12_000)),
    maxRetries: 0,
    ponder: false,
  };
  let attempts = 0;
  let result: Awaited<ReturnType<typeof requestBestMove>> | null = null;
  // Retry only transient capacity/network failures; auth/config failures stay
  // fail-closed and are never hidden behind a retry.
  while (attempts < 3) {
    attempts += 1;
    result = await requestBestMove({
      fen: probe.fen,
      variant: "standard",
      config: probeConfig,
      clock: null,
      sessionId: `qualification-${kind}-${crypto.randomUUID()}`,
      requestId: crypto.randomUUID(),
      newGame: true,
    });
    if (result.status === "ok" || !TRANSIENT_STATUSES.has(result.status)) break;
    await new Promise((resolve) => setTimeout(resolve, attempts * 250));
  }

  const status = result?.status ?? "unavailable";
  const bestmove = result?.bestmove ?? null;
  const legal = status === "ok" && isLegalBenchmarkMove(probe.fen, bestmove);
  const timeouts = status === "timeout" ? 1 : 0;
  const engineErrors = status !== "ok" && status !== "timeout" ? 1 : 0;
  const noMove = status === "ok" && !bestmove ? 1 : 0;
  const illegalMoves = status === "ok" && bestmove && !legal ? 1 : 0;
  const engineVersion = result?.engineVersion ?? null;
  const supportedVersion = /stockfish\s*18/i.test(engineVersion ?? "");
  const passed = legal && timeouts === 0 && engineErrors === 0 && noMove === 0 && supportedVersion;
  return {
    kind,
    status: passed ? ("ok" as const) : status === "ok" ? ("invalid" as const) : status,
    engineVersion,
    nodes: result?.nodes ?? null,
    nps: result?.nps ?? null,
    depth: result?.depth ?? null,
    score: passed ? 1 : 0,
    passed,
    suiteVersion: null as string | null,
    serviceBuildId: null as string | null,
    detail: {
      kind,
      mode: "bounded_bestmove",
      solved: passed ? 1 : 0,
      total: 1,
      legalMoves: legal ? 1 : 0,
      legalUnsolved: 0,
      illegalMoves,
      noMove,
      timeouts,
      poolBusy: 0,
      engineErrors,
      durationMs: result?.timeMs ?? 0,
      attempts,
      failureReasons: passed
        ? []
        : [
            ...(engineErrors ? ["engine_error"] : []),
            ...(timeouts ? ["timeout"] : []),
            ...(noMove ? ["no_move"] : []),
            ...(illegalMoves ? ["illegal_move"] : []),
            ...(!supportedVersion ? ["engine_version_unsupported"] : []),
          ],
    } as Record<string, unknown>,
  };
}

/**
 * Canonical EPD / positions run.
 *
 * The suite, the scoring and the failure classification all live in
 * `services/play-engine/src/benchmark.js`. The backend does NOT recompute a
 * second verdict here: it verifies the response contract (suite identity,
 * engine version, structured counters) and stores the raw result.
 */
async function runCanonicalSuite(kind: "epd" | "positions", config: EngineConfig) {
  const { runCloudBenchmark } = await import("./cloudEngine.server");
  const run = await runCloudBenchmark(kind, config);
  const detail = (run.detail ?? {}) as Record<string, unknown>;
  const suiteVersion = typeof detail["suiteVersion"] === "string" ? (detail["suiteVersion"] as string) : null;
  const serviceBuildId =
    typeof detail["serviceBuildId"] === "string" ? (detail["serviceBuildId"] as string) : null;
  const engineVersion = run.engineVersion;
  const supportedVersion = /stockfish\s*18/i.test(engineVersion ?? "");
  const total = Number(detail["total"] ?? 0);
  // A response that does not carry the expected suite identity is never
  // allowed to become a passing row for that suite.
  const contractOk = suiteVersion === EXPECTED_BENCHMARK_SUITE_VERSION && total > 0 && supportedVersion;
  const passed = run.status === "ok" && run.passed === true && contractOk;
  const failureReasons = Array.isArray(detail["failureReasons"])
    ? (detail["failureReasons"] as string[])
    : [];
  return {
    kind,
    status: run.status,
    engineVersion,
    nodes: run.nodes,
    nps: run.nps,
    depth: run.depth,
    score: run.score ?? 0,
    passed,
    suiteVersion,
    serviceBuildId,
    detail: {
      ...detail,
      kind,
      mode: "cloud_suite",
      failureReasons: passed
        ? []
        : [
            ...failureReasons,
            ...(run.status !== "ok" ? [`transport_${run.status}`] : []),
            ...(!supportedVersion ? ["engine_version_unsupported"] : []),
            ...(suiteVersion !== EXPECTED_BENCHMARK_SUITE_VERSION ? ["suite_version_mismatch"] : []),
          ],
    } as Record<string, unknown>,
  };
}

export async function runBenchmark(args: {
  kind: BenchmarkKind;
  actorId: string;
  /** Profile the run is recorded against. */
  slug?: string;
  /** Server-validated config to benchmark — the admin's current draft. */
  config?: EngineConfig;
}): Promise<BenchmarkOutcome> {
  const { titanProfile, getEngineProfile } = await import("./profiles.server");
  const { cloudEngineConfigured } = await import("./cloudEngine.server");
  if (!cloudEngineConfigured()) return { ok: false, code: "ENGINE_NOT_CONFIGURED" };

  const row = args.slug ? await getEngineProfile(args.slug) : null;
  const profile = row ?? (await titanProfile());
  // Benchmark exactly what the admin intends to publish, not the live config.
  const config = args.config ?? row?.draftConfig ?? profile.config;

  // The deployment contract is checked BEFORE any row is written, so a stale
  // image can never produce a row tagged with a suite it does not ship.
  const contract = await checkEngineContract(config);
  if (!contract.ok) return { ok: false, code: contract.code ?? "ENGINE_UNAVAILABLE" };

  // Tactics/legality are scored by the canonical service-side suite;
  // bench/speedtest stay bounded throughput probes.
  const run =
    args.kind === "epd" || args.kind === "positions"
      ? await runCanonicalSuite(args.kind, config)
      : await runBoundedBenchmark(args.kind, config);
  const detail = {
    ...run.detail,
    suiteVersion: run.suiteVersion ?? EXPECTED_BENCHMARK_SUITE_VERSION,
    serviceBuildId: run.serviceBuildId ?? contract.serviceBuildId,
  } as Record<string, unknown>;


  const db = await admin();
  const { data, error } = await db
    .from("engine_benchmarks")
    .insert({
      profile_slug: profile.slug,
      profile_version: profile.version,
      kind: args.kind,
      engine_version: run.engineVersion ?? "unknown",
      hardware: ((detail["hardware"] ?? {}) as Record<string, Json>) as never,
      nodes: run.nodes ?? null,
      nps: run.nps ?? null,
      depth: run.depth ?? null,
      score: run.score ?? null,
      passed: run.passed,
      result: detail as never,
      signature: run.engineVersion ?? null,
      // Benchmarks are always recorded against the exact config they ran with.
      config_signature: await engineConfigFingerprint(config),
      suite_version: run.suiteVersion ?? EXPECTED_BENCHMARK_SUITE_VERSION,
      created_by: args.actorId,
    } as never)
    .select("*")
    .single();
  if (error || !data) return { ok: false, code: "WRITE_FAILED" };
  const rows = [data as Record<string, unknown>];
  const mapped = (await Promise.resolve(rows)).map((row) => ({
    id: String(row["id"]),
    profileSlug: String(row["profile_slug"]),
    profileVersion: Number(row["profile_version"]),
    kind: row["kind"] as BenchmarkKind,
    engineVersion: String(row["engine_version"]),
    hardware: (row["hardware"] ?? {}) as Record<string, Json>,
    nodes: row["nodes"] === null ? null : Number(row["nodes"]),
    nps: row["nps"] === null ? null : Number(row["nps"]),
    depth: row["depth"] === null ? null : Number(row["depth"]),
    score: row["score"] === null ? null : Number(row["score"]),
    passed: Boolean(row["passed"]),
    result: (row["result"] ?? {}) as Record<string, Json>,
    configSignature: row["config_signature"] === null || row["config_signature"] === undefined
      ? null
      : String(row["config_signature"]),
    suiteVersion: row["suite_version"] ? String(row["suite_version"]) : null,
    createdAt: String(row["created_at"]),
  }))[0]!;
  return run.status === "ok"
    ? { ok: true, row: mapped }
    : { ok: false, code: run.status.toUpperCase(), row: mapped };
}

/**
 * Publish gate: Titan may only go live when the LATEST run of each required
 * benchmark kind is green and was produced for the config being published.
 * Older failed runs never poison readiness.
 */
export async function publishReadiness(
  slug = TITAN_SLUG,
  config?: EngineConfig | null,
): Promise<ReadinessResult> {
  const signature = config ? await engineConfigFingerprint(config) : null;
  if (!signature) return evaluateReadiness(await listBenchmarks(slug, 50), null, QUALIFICATION_SUITE_VERSION);
  // Fetch matching rows explicitly so heavy benchmark history from other
  // drafts can never push the authoritative fingerprint out of a global limit.
  const [matching, recent] = await Promise.all([
    listBenchmarks(slug, 50, signature),
    listBenchmarks(slug, 50),
  ]);
  const byId = new Map([...matching, ...recent].map((row) => [row.id, row]));
  return evaluateReadiness([...byId.values()], signature, QUALIFICATION_SUITE_VERSION);
}
