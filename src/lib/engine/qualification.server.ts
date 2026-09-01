/**
 * Titan production qualification — one atomic admin workflow.
 *
 * Runs the required production sequence against ONE config fingerprint:
 *   preflight -> bench -> speedtest -> epd -> positions -> selfplay (skipped)
 *
 * Fails closed: every step keeps its own `engine_benchmarks` row, a step is
 * only green when the benchmark's own `passed` flag is true (HTTP 200 with
 * `passed=false` is a failure), and the whole run is invalidated if the admin
 * draft config changes while it is executing.
 */
import type { EngineConfig } from "./profileTypes";
import type { BenchmarkKind, BenchmarkRow } from "./benchmarkTypes";
import type { QualificationResult, QualificationStep, QualificationStepId } from "./qualificationTypes";

export type { QualificationResult, QualificationStep, QualificationStepId };

/** Benchmark kinds executed by the suite, in order. `selfplay` is not implemented. */
const BENCHMARK_SEQUENCE: BenchmarkKind[] = ["bench", "speedtest", "epd", "positions"];

function step(
  id: QualificationStepId,
  status: QualificationStep["status"],
  extra: Partial<QualificationStep> = {},
): QualificationStep {
  return {
    id,
    status,
    durationMs: 0,
    engineVersion: null,
    nps: null,
    depth: null,
    score: null,
    benchmarkId: null,
    reason: null,
    ...extra,
  };
}

/** Health/secret/pool/config gate. Returns a reason code when it fails. */
async function preflight(config: EngineConfig): Promise<{ ok: boolean; reason: string | null; engineVersion: string | null }> {
  const { engineConfigSchema } = await import("./profileTypes");
  const { engineEnvDiagnostics } = await import("./engineEnv.server");
  const { cloudEngineHealthCached } = await import("./cloudEngine.server");

  if (!engineConfigSchema.safeParse(config).success) {
    return { ok: false, reason: "invalid_config", engineVersion: null };
  }
  const env = engineEnvDiagnostics();
  if (!env.configured) return { ok: false, reason: `secrets_${env.code ?? "missing"}`, engineVersion: null };

  let health = await cloudEngineHealthCached(0);
  // Cold starts and a temporarily saturated single-process pool are transient.
  // Re-probe health briefly, but never retry auth/config/version failures.
  for (let attempt = 1; attempt < 3; attempt += 1) {
    const transient = health.status === "unavailable" || health.status === "degraded" || !health.engineVersion;
    if (!transient) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    health = await cloudEngineHealthCached(0);
  }
  if (health.status === "unauthorized") return { ok: false, reason: "engine_auth_failed", engineVersion: null };
  if (health.status !== "healthy" && health.status !== "degraded") {
    return { ok: false, reason: "engine_unavailable", engineVersion: health.engineVersion };
  }
  if (!health.pool || health.pool.size < 1) {
    return { ok: false, reason: "engine_pool_unavailable", engineVersion: health.engineVersion };
  }
  if (!/stockfish\s*18/i.test(health.engineVersion ?? "")) {
    return { ok: false, reason: "engine_version_unsupported", engineVersion: health.engineVersion };
  }
  return { ok: true, reason: null, engineVersion: health.engineVersion };
}

/**
 * Execute the qualification suite. The caller applies the admin rate limit ONCE
 * before calling this; internal steps are controlled and not limited again.
 */
export async function runTitanQualification(args: {
  slug: string;
  config: EngineConfig;
  actorId: string;
}): Promise<QualificationResult> {
  const { engineConfigFingerprint } = await import("./configFingerprint");
  const { runBenchmark, publishReadiness } = await import("./benchmarks.server");
  const { getEngineProfile } = await import("./profiles.server");

  const startedAt = Date.now();
  const signature = await engineConfigFingerprint(args.config);
  const steps: QualificationStep[] = [];
  const reasons: string[] = [];
  const rows: BenchmarkRow[] = [];

  const preStart = Date.now();
  const pre = await preflight(args.config);
  steps.push(
    step("preflight", pre.ok ? "passed" : "failed", {
      durationMs: Date.now() - preStart,
      engineVersion: pre.engineVersion,
      reason: pre.reason,
    }),
  );
  if (!pre.ok) {
    reasons.push(pre.reason ?? "preflight_failed");
    for (const kind of BENCHMARK_SEQUENCE) steps.push(step(kind, "skipped", { reason: "preflight_failed" }));
    steps.push(step("selfplay", "skipped", { reason: "not_implemented" }));
    return { ok: false, configSignature: signature, steps, reasons, readiness: null, rows, durationMs: Date.now() - startedAt };
  }

  for (const kind of BENCHMARK_SEQUENCE) {
    const stepStart = Date.now();
    const outcome = await runBenchmark({ kind, actorId: args.actorId, slug: args.slug, config: args.config });
    const row = outcome.row ?? null;
    if (row) rows.push(row);
    // A stored row with passed=false is a real failure, not a transport success.
    const passed = Boolean(outcome.ok && row?.passed);
    const failureReasons = Array.isArray(row?.result["failureReasons"])
      ? (row!.result["failureReasons"] as string[]).join(",")
      : null;
    steps.push(
      step(kind, passed ? "passed" : "failed", {
        durationMs: Date.now() - stepStart,
        engineVersion: row?.engineVersion ?? null,
        nps: row?.nps ?? null,
        depth: row?.depth ?? null,
        score: row?.score ?? null,
        benchmarkId: row?.id ?? null,
        reason: passed ? null : (outcome.code ?? failureReasons ?? "benchmark_failed"),
      }),
    );
    if (!passed) reasons.push(`${kind}_failed`);
  }

  // Self-play is not implemented by the engine service; it is reported as an
  // explicit skip instead of a clickable step that returns unknown_kind.
  steps.push(step("selfplay", "skipped", { reason: "not_implemented" }));

  // The draft must not have moved underneath the suite.
  const profile = await getEngineProfile(args.slug);
  const currentDraft = profile?.draftConfig ?? profile?.config ?? null;
  const currentSignature = currentDraft ? await engineConfigFingerprint(currentDraft) : null;
  const configChanged = Boolean(currentSignature && currentSignature !== signature);
  if (configChanged) reasons.push("config_changed_during_run");

  // Never present readiness for a stale draft as if it described the current
  // Admin form. Rows remain auditable under their original fingerprint.
  const readiness = configChanged ? null : await publishReadiness(args.slug, args.config);
  if (readiness && !readiness.ready) for (const r of readiness.reasons) if (!reasons.includes(r)) reasons.push(r);

  return {
    ok: reasons.length === 0,
    configSignature: signature,
    steps,
    reasons,
    readiness,
    rows,
    durationMs: Date.now() - startedAt,
  };
}
