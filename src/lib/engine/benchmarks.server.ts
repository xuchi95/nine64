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
 * Identity of the qualification suite. Stored on every row so a result can
 * never be compared against a run produced by a different set of positions.
 * Bump this whenever the probe sets below change.
 */
export const QUALIFICATION_SUITE_VERSION = "titan-v6-1";

const PERFORMANCE_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type Probe = {
  fen: string;
  moves: readonly string[];
  variant?: "standard" | "chess960";
};

/**
 * Deterministic tactical probes: every entry is a forced mate whose complete
 * mating-move set is enumerated, so a healthy Stockfish 18 must find one.
 */
const TACTICAL_PROBES: readonly Probe[] = [
  { fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4", moves: ["f3f7"] },
  { fen: "2r3k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 1", moves: ["c1c8"] },
  { fen: "3r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", moves: ["d1d8"] },
  { fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", moves: ["a1a8"] },
  { fen: "7k/6pp/8/8/8/8/6PP/5R1K w - - 0 1", moves: ["f1f8"] },
  { fen: "k7/7R/1K6/8/8/8/8/8 w - - 0 1", moves: ["h7h8"] },
  // Smothered mate.
  { fen: "6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1", moves: ["h6f7"] },
  // Promotion mate: the promotion piece is part of the expected UCI.
  { fen: "6k1/4Pppp/8/8/8/8/5PPP/6K1 w - - 0 1", moves: ["e7e8q", "e7e8r"] },
  // Black to move: two mating queen moves are both acceptable.
  { fen: "8/8/8/8/8/2k5/1q6/K7 b - - 0 1", moves: ["c3c2", "c3b3"] },
];

/**
 * Legality probes: any legal move passes. Includes Chess960 start positions —
 * the engine service validates 960 castling encoding itself, so a regression
 * there surfaces as an engine error here instead of only in a live game.
 */
const POSITION_PROBES: readonly Probe[] = [
  { fen: PERFORMANCE_FEN, moves: [] },
  { fen: "r1bq1rk1/pp2ppbp/2np1np1/8/2BNP3/2N1B3/PPP2PPP/R2QK2R w KQ - 0 9", moves: [] },
  { fen: "8/8/8/4k3/8/4K3/4P3/8 w - - 0 1", moves: [] },
  { fen: "r3k2r/pppq1ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPPQ1PPP/R3K2R w KQkq - 6 8", moves: [] },
  { fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", moves: [] },
  { fen: "bqnbrkrn/pppppppp/8/8/8/8/PPPPPPPP/BQNBRKRN w KQkq - 0 1", moves: [], variant: "chess960" },
  { fen: "rknbbqnr/pppppppp/8/8/8/8/PPPPPPPP/RKNBBQNR w KQkq - 0 1", moves: [], variant: "chess960" },
];

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
 * Bounded production probes. Cloud Run terminates Stockfish's native `bench`
 * command at its 120s request ceiling, so qualification measures the same
 * Stockfish 18 process through its real `/bestmove` path instead. The service
 * validates returned moves before responding; transport/no-move failures stay
 * hard failures and the original config fingerprint remains authoritative.
 */
async function runBoundedBenchmark(kind: BenchmarkKind, config: EngineConfig) {
  const { requestBestMove } = await import("./cloudEngine.server");
  type ProbeResult = Awaited<ReturnType<typeof requestBestMove>> & {
    expected: readonly string[];
    fen: string;
    attempts: number;
    legal: boolean;
  };
  const probes = kind === "epd"
    ? TACTICAL_PROBES
    : kind === "positions"
      ? POSITION_PROBES
      : [{ fen: PERFORMANCE_FEN, moves: [] as readonly string[] }];
  const movetimeMs = kind === "speedtest" ? 750 : kind === "bench" ? 2_000 : 1_500;
  const probeConfig: EngineConfig = {
    ...config,
    timePolicy: "movetime",
    moveTimeMs: movetimeMs,
    maxMoveTimeMs: movetimeMs,
    requestTimeoutMs: Math.min(120_000, Math.max(config.requestTimeoutMs, movetimeMs + 12_000)),
    maxRetries: 0,
    ponder: false,
  };
  const results: ProbeResult[] = [];
  for (let index = 0; index < probes.length; index += 1) {
    const probe = probes[index];
    if (!probe) continue;
    let attempts = 0;
    let result: Awaited<ReturnType<typeof requestBestMove>> | null = null;
    // Retry only transient capacity/network failures. Invalid/auth/config
    // failures remain fail-closed and are never hidden by retries.
    while (attempts < 3) {
      attempts += 1;
      result = await requestBestMove({
        fen: probe.fen,
        variant: probe.variant ?? "standard",
        config: probeConfig,
        clock: null,
        sessionId: `qualification-${kind}-${index}-${crypto.randomUUID()}`,
        requestId: crypto.randomUUID(),
        newGame: true,
      });
      if (result.status === "ok" || !TRANSIENT_STATUSES.has(result.status)) break;
      await new Promise((resolve) => setTimeout(resolve, attempts * 250));
    }
    if (!result) continue;
    results.push({
      ...result,
      expected: probe.moves,
      fen: probe.fen,
      attempts,
      // Standard positions are re-validated locally with chess.js. Chess960
      // castling uses king-takes-rook encoding that chess.js cannot verify, so
      // there the engine service's own variant-aware legality check is
      // authoritative — an illegal 960 move comes back as an engine error.
      legal:
        result.status === "ok" &&
        (probe.variant === "chess960"
          ? Boolean(result.bestmove)
          : isLegalBenchmarkMove(probe.fen, result.bestmove)),
    });
  }
  const engineErrors = results.filter((result) => result.status !== "ok").length;
  const noMove = results.filter((result) => result.status === "ok" && !result.bestmove).length;
  const illegalMoves = results.filter((result) => result.status === "ok" && result.bestmove && !result.legal).length;
  const solved = kind === "epd"
    ? results.filter((result) => result.legal && result.bestmove && result.expected.includes(result.bestmove as never)).length
    : results.filter((result) => result.status === "ok" && result.bestmove && result.legal).length;
  const total = results.length;
  const clean = total === probes.length && engineErrors === 0 && noMove === 0 && illegalMoves === 0;
  const engineVersion = results.find((result) => result.engineVersion)?.engineVersion ?? null;
  const supportedVersion = /stockfish\s*18/i.test(engineVersion ?? "");
  const passed = clean && solved === total && supportedVersion;
  const numeric = (key: "nodes" | "nps" | "depth") =>
    results.reduce((max, result) => Math.max(max, result[key] ?? 0), 0) || null;
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
      suiteVersion: QUALIFICATION_SUITE_VERSION,
      solved,
      total,
      legalMoves: results.filter((result) => result.status === "ok" && result.bestmove && result.legal).length,
      illegalMoves,
      noMove,
      timeouts: results.filter((result) => result.status === "timeout").length,
      engineErrors: results.filter((result) => result.status !== "ok" && result.status !== "timeout").length,
      durationMs: results.reduce((sum, result) => sum + (result.timeMs ?? 0), 0),
      attempts: results.reduce((sum, result) => sum + result.attempts, 0),
      failureReasons: passed
        ? []
        : [
            ...(results.length !== probes.length ? ["incomplete_suite"] : []),
            ...(engineErrors ? ["engine_error"] : []),
            ...(noMove ? ["no_move"] : []),
            ...(illegalMoves ? ["illegal_move"] : []),
            ...(solved !== total ? [kind === "epd" ? "tactics_score" : "position_failed"] : []),
            ...(!supportedVersion ? ["engine_version_unsupported"] : []),
          ],
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
  const { cloudEngineConfigured } = await import("./cloudEngine.server");
  if (!cloudEngineConfigured()) return { ok: false, code: "ENGINE_NOT_CONFIGURED" };

  const row = args.slug ? await getEngineProfile(args.slug) : null;
  const profile = row ?? (await titanProfile());
  // Benchmark exactly what the admin intends to publish, not the live config.
  const config = args.config ?? row?.draftConfig ?? profile.config;
  // All qualification kinds use bounded real searches. This avoids native
  // `bench` request ceilings and keeps qualification independent of a stale
  // benchmark suite deployment while still exercising Stockfish 18 itself.
  const run = await runBoundedBenchmark(args.kind, config);

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
      suite_version: QUALIFICATION_SUITE_VERSION,
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
  if (!signature) return evaluateReadiness(await listBenchmarks(slug, 50), null);
  // Fetch matching rows explicitly so heavy benchmark history from other
  // drafts can never push the authoritative fingerprint out of a global limit.
  const [matching, recent] = await Promise.all([
    listBenchmarks(slug, 50, signature),
    listBenchmarks(slug, 50),
  ]);
  const byId = new Map([...matching, ...recent].map((row) => [row.id, row]));
  return evaluateReadiness([...byId.values()], signature);
}
