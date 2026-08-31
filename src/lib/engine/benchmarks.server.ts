/**
 * Engine benchmarks.
 *
 * Every stored row records the real engine version, profile version, hardware
 * reported by the service and the raw result. Nothing here invents NPS or Elo
 * numbers: when the cloud service is not configured the run simply fails with
 * `not_configured`.
 */
import { TITAN_SLUG } from "./profileTypes";

export const BENCHMARK_KINDS = ["bench", "speedtest", "epd", "positions", "selfplay"] as const;
export type BenchmarkKind = (typeof BENCHMARK_KINDS)[number];

export interface BenchmarkRow {
  id: string;
  profileSlug: string;
  profileVersion: number;
  kind: BenchmarkKind;
  engineVersion: string;
  hardware: Record<string, unknown>;
  nodes: number | null;
  nps: number | null;
  depth: number | null;
  score: number | null;
  passed: boolean;
  result: Record<string, unknown>;
  createdAt: string;
}

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
      hardware: (row["hardware"] ?? {}) as Record<string, unknown>,
      nodes: row["nodes"] === null ? null : Number(row["nodes"]),
      nps: row["nps"] === null ? null : Number(row["nps"]),
      depth: row["depth"] === null ? null : Number(row["depth"]),
      score: row["score"] === null ? null : Number(row["score"]),
      passed: Boolean(row["passed"]),
      result: (row["result"] ?? {}) as Record<string, unknown>,
      createdAt: String(row["created_at"]),
    };
  });
}

export interface BenchmarkOutcome {
  ok: boolean;
  code?: string;
  row?: BenchmarkRow;
}

export async function runBenchmark(args: {
  kind: BenchmarkKind;
  actorId: string;
}): Promise<BenchmarkOutcome> {
  const { titanProfile } = await import("./profiles.server");
  const { runCloudBenchmark, cloudEngineConfigured } = await import("./cloudEngine.server");
  if (!cloudEngineConfigured()) return { ok: false, code: "ENGINE_NOT_CONFIGURED" };

  const profile = await titanProfile();
  const run = await runCloudBenchmark(args.kind, profile.config);
  if (run.status !== "ok") return { ok: false, code: run.status.toUpperCase() };

  const db = await admin();
  const { data, error } = await db
    .from("engine_benchmarks")
    .insert({
      profile_slug: profile.slug,
      profile_version: profile.version,
      kind: args.kind,
      engine_version: run.engineVersion ?? "unknown",
      hardware: ((run.detail["hardware"] ?? {}) as Record<string, unknown>) as never,
      nodes: run.nodes ?? null,
      nps: run.nps ?? null,
      depth: run.depth ?? null,
      score: run.score ?? null,
      passed: run.passed,
      result: run.detail as never,
      signature: run.engineVersion ?? null,
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
    hardware: (row["hardware"] ?? {}) as Record<string, unknown>,
    nodes: row["nodes"] === null ? null : Number(row["nodes"]),
    nps: row["nps"] === null ? null : Number(row["nps"]),
    depth: row["depth"] === null ? null : Number(row["depth"]),
    score: row["score"] === null ? null : Number(row["score"]),
    passed: Boolean(row["passed"]),
    result: (row["result"] ?? {}) as Record<string, unknown>,
    createdAt: String(row["created_at"]),
  }))[0]!;
  return { ok: true, row: mapped };
}

/**
 * Publish gate: Titan may only go live when the latest runs are green.
 * Missing benchmarks block publishing rather than being assumed to pass.
 */
export async function publishReadiness(slug = TITAN_SLUG): Promise<{
  ready: boolean;
  reasons: string[];
  latest: BenchmarkRow[];
}> {
  const latest = await listBenchmarks(slug, 10);
  const reasons: string[] = [];
  const bench = latest.find((r) => r.kind === "bench");
  const tactics = latest.find((r) => r.kind === "epd");
  if (!bench) reasons.push("missing_bench");
  else if (!bench.passed) reasons.push("bench_failed");
  if (!tactics) reasons.push("missing_tactics");
  else if (!tactics.passed) reasons.push("tactics_failed");
  const illegal = latest.find((r) => Number(r.result["illegalMoves"] ?? 0) > 0);
  if (illegal) reasons.push("illegal_moves");
  return { ready: reasons.length === 0, reasons, latest };
}
