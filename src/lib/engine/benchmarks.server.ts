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
  const run = await runCloudBenchmark(args.kind, config);
  if (run.status !== "ok") return { ok: false, code: run.status.toUpperCase() };

  const db = await admin();
  const { data, error } = await db
    .from("engine_benchmarks")
    .insert({
      profile_slug: profile.slug,
      profile_version: profile.version,
      kind: args.kind,
      engine_version: run.engineVersion ?? "unknown",
      hardware: ((run.detail["hardware"] ?? {}) as Record<string, Json>) as never,
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
