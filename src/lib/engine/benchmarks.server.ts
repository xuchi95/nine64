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

export { evaluateReadiness, latestBenchmarkByKind } from "./readiness";
export { engineConfigFingerprint, canonicalConfigJson } from "./configFingerprint";

export { BENCHMARK_KINDS };
export type { BenchmarkKind, BenchmarkRow };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function listBenchmarks(slug = TITAN_SLUG, limit = 50): Promise<BenchmarkRow[]> {
  const db = await admin();
  const { data } = await db
    .from("engine_benchmarks")
    .select("*")
    .eq("profile_slug", slug)
    .order("created_at", { ascending: false })
    .limit(limit);
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
      createdAt: String(row["created_at"]),
    };
  });
}

export interface BenchmarkOutcome {
  ok: boolean;
  code?: string;
  row?: BenchmarkRow;
}

const PERFORMANCE_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const TACTICAL_PROBES = [
  { fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4", moves: ["f3f7"] },
  { fen: "2r3k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 1", moves: ["c1c8"] },
  { fen: "3r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", moves: ["d1d8"] },
] as const;

/**
 * Bounded production probes. Cloud Run terminates Stockfish's native `bench`
 * command at its 120s request ceiling, so qualification measures the same
 * Stockfish 18 process through its real `/bestmove` path instead. The service
 * validates returned moves before responding; transport/no-move failures stay
 * hard failures and the original config fingerprint remains authoritative.
 */
async function runBoundedBenchmark(kind: BenchmarkKind, config: EngineConfig) {
  const { requestBestMove } = await import("./cloudEngine.server");
  type ProbeResult = Awaited<ReturnType<typeof requestBestMove>> & { expected: readonly string[] };
  const probes = kind === "epd" ? TACTICAL_PROBES : [{ fen: PERFORMANCE_FEN, moves: [] as string[] }];
  const movetimeMs = kind === "speedtest" ? 750 : kind === "bench" ? 2_000 : 1_500;
  const probeConfig: EngineConfig = {
    ...config,
    timePolicy: "movetime",
    moveTimeMs: movetimeMs,
    maxMoveTimeMs: movetimeMs,
    requestTimeoutMs: Math.max(config.requestTimeoutMs, movetimeMs + 8_000),
    maxRetries: 0,
    ponder: false,
  };
  const results: ProbeResult[] = [];
  for (let index = 0; index < probes.length; index += 1) {
    const probe = probes[index];
    if (!probe) continue;
    const result = await requestBestMove({
      fen: probe.fen,
      variant: "standard",
      config: probeConfig,
      clock: null,
      sessionId: `qualification-${kind}-${index}`,
      requestId: crypto.randomUUID(),
      newGame: true,
    });
    results.push({ ...result, expected: probe.moves });
  }
  const engineErrors = results.filter((result) => result.status !== "ok").length;
  const noMove = results.filter((result) => result.status === "ok" && !result.bestmove).length;
  const solved = kind === "epd"
    ? results.filter((result) => result.bestmove && result.expected.includes(result.bestmove as never)).length
    : results.filter((result) => result.status === "ok" && result.bestmove).length;
  const total = results.length;
  const clean = total > 0 && engineErrors === 0 && noMove === 0;
  const passed = clean && solved === total;
  const numeric = (key: "nodes" | "nps" | "depth") =>
    results.reduce((max, result) => Math.max(max, result[key] ?? 0), 0) || null;
  const engineVersion = results.find((result) => result.engineVersion)?.engineVersion ?? null;
  return {
    kind,
    status: clean ? "ok" as const : results.find((result) => result.status !== "ok")?.status ?? "invalid" as const,
    engineVersion,
    nodes: numeric("nodes"),
    nps: numeric("nps"),
    depth: numeric("depth"),
    score: total ? solved / total : 0,
    passed,
    detail: {
      kind,
      mode: "bounded_bestmove",
      solved,
      total,
      legalMoves: results.filter((result) => result.status === "ok" && result.bestmove).length,
      illegalMoves: 0,
      noMove,
      timeouts: results.filter((result) => result.status === "timeout").length,
      engineErrors: results.filter((result) => result.status !== "ok" && result.status !== "timeout").length,
      durationMs: results.reduce((sum, result) => sum + (result.timeMs ?? 0), 0),
      failureReasons: passed ? [] : ["bounded_probe_failed"],
    },
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
  const { runCloudBenchmark, cloudEngineConfigured } = await import("./cloudEngine.server");
  if (!cloudEngineConfigured()) return { ok: false, code: "ENGINE_NOT_CONFIGURED" };

  const row = args.slug ? await getEngineProfile(args.slug) : null;
  const profile = row ?? (await titanProfile());
  // Benchmark exactly what the admin intends to publish, not the live config.
  const config = args.config ?? row?.draftConfig ?? profile.config;
  // Qualification kinds use bounded real searches so they complete within
  // the production request ceiling. `positions` remains on the service suite.
  const run = args.kind === "positions"
    ? await runCloudBenchmark(args.kind, config)
    : await runBoundedBenchmark(args.kind, config);
  if (run.status !== "ok") return { ok: false, code: run.status.toUpperCase() };

  const db = await admin();
  const { data, error } = await db
    .from("engine_benchmarks")
    .insert({
      profile_slug: profile.slug,
      profile_version: profile.version,
      kind: args.kind,
      engine_version: run.engineVersion ?? "unknown",
      hardware: (((run.detail as Record<string, unknown>)["hardware"] ?? {}) as Record<string, Json>) as never,
      nodes: run.nodes ?? null,
      nps: run.nps ?? null,
      depth: run.depth ?? null,
      score: run.score ?? null,
      passed: run.passed,
      result: run.detail as never,
      signature: run.engineVersion ?? null,
      // Benchmarks are always recorded against the exact config they ran with.
      config_signature: await engineConfigFingerprint(config),
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
    createdAt: String(row["created_at"]),
  }))[0]!;
  return { ok: true, row: mapped };
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
  const rows = await listBenchmarks(slug, 50);
  return evaluateReadiness(rows, config ? await engineConfigFingerprint(config) : null);
}
