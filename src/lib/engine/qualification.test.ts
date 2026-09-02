import { describe, expect, it, vi, beforeEach } from "vitest";
import type { EngineConfig } from "./profileTypes";

const health = { value: {
  status: "healthy",
  engineVersion: "Stockfish 18",
  pool: { size: 4, busy: 0 },
  benchmarkSuiteVersion: "titan-v6-3",
  serviceBuildId: "play-engine-titan-v6.3-test",
  serviceVersion: "play-engine-titan-v6.3",
  capabilities: {
    cpuCount: 8,
    memoryMb: 16384,
    poolSize: 1,
    maxThreadsPerEngine: 8,
    recommendedHashMb: 4096,
    maxSafeHashMb: 8192,
    syzygyReady: false,
    syzygyPieces: 0,
  },
} as never };
const env = { value: { configured: true, code: null } as never };
const benchOutcome: { impl: (kind: string) => unknown } = {
  impl: (kind: string) => ({
    ok: true,
    row: { id: `row-${kind}`, kind, passed: true, engineVersion: "Stockfish 18", nps: 1_000_000, depth: 20, score: 10, result: {}, configSignature: "sig" },
  }),
};
const readiness = { value: { ready: true, reasons: [] as string[] } };
const draft = { value: { multipv: 1 } as unknown as EngineConfig };

vi.mock("./cloudEngine.server", () => ({ cloudEngineHealthCached: async () => health.value }));
vi.mock("./engineEnv.server", () => ({ engineEnvDiagnostics: () => env.value }));
vi.mock("./configFingerprint", () => ({
  engineConfigFingerprint: async (cfg: unknown) => `fp-${JSON.stringify(cfg)}`,
}));
vi.mock("./benchmarks.server", () => ({
  runBenchmark: async ({ kind }: { kind: string }) => benchOutcome.impl(kind),
  publishReadiness: async () => readiness.value,
}));
vi.mock("./profiles.server", () => ({
  getEngineProfile: async () => ({ slug: "titan", draftConfig: draft.value, config: draft.value }),
}));

const config = { multipv: 1 } as unknown as EngineConfig;

async function runSuite() {
  const { runTitanQualification } = await import("./qualification.server");
  return runTitanQualification({ slug: "titan", config, actorId: "admin-1" });
}

describe("titan qualification suite", () => {
  beforeEach(() => {
    health.value = {
  status: "healthy",
  engineVersion: "Stockfish 18",
  pool: { size: 4, busy: 0 },
  benchmarkSuiteVersion: "titan-v6-3",
  serviceBuildId: "play-engine-titan-v6.3-test",
  serviceVersion: "play-engine-titan-v6.3",
  capabilities: {
    cpuCount: 8,
    memoryMb: 16384,
    poolSize: 1,
    maxThreadsPerEngine: 8,
    recommendedHashMb: 4096,
    maxSafeHashMb: 8192,
    syzygyReady: false,
    syzygyPieces: 0,
  },
} as never;
    env.value = { configured: true, code: null } as never;
    readiness.value = { ready: true, reasons: [] };
    draft.value = { multipv: 1 } as unknown as EngineConfig;
    benchOutcome.impl = (kind: string) => ({
      ok: true,
      row: { id: `row-${kind}`, kind, passed: true, engineVersion: "Stockfish 18", nps: 1_000_000, depth: 20, score: 10, result: {}, configSignature: "sig" },
    });
  });

  it("passes when preflight and every benchmark passes, skipping self-play", async () => {
    const result = await runSuite();
    expect(result.ok).toBe(true);
    expect(result.steps.map((s) => s.id)).toEqual([
      "preflight",
      "bench",
      "speedtest",
      "epd",
      "positions",
      "selfplay",
    ]);
    expect(result.steps.find((s) => s.id === "selfplay")!.status).toBe("skipped");
    expect(result.rows).toHaveLength(4);
  });

  it("treats HTTP success with passed=false as a failed step", async () => {
    benchOutcome.impl = (kind: string) => ({
      ok: true,
      row: { id: `row-${kind}`, kind, passed: kind !== "epd", engineVersion: "Stockfish 18", nps: 1, depth: 1, score: 1, result: { failureReasons: ["illegal_moves"] }, configSignature: "sig" },
    });
    const result = await runSuite();
    expect(result.ok).toBe(false);
    const epd = result.steps.find((s) => s.id === "epd")!;
    expect(epd.status).toBe("failed");
    expect(epd.reason).toBe("illegal_moves");
    expect(result.reasons).toContain("epd_failed");
  });

  it("fails closed and skips benchmarks when the engine version is unsupported", async () => {
    health.value = {
      status: "healthy",
      engineVersion: "Stockfish 16",
      pool: { size: 4, busy: 0 },
      benchmarkSuiteVersion: "titan-v6-3",
      serviceBuildId: "play-engine-titan-v6.3-test",
      serviceVersion: "play-engine-titan-v6.3",
      capabilities: {
        cpuCount: 8,
        memoryMb: 16384,
        poolSize: 1,
        maxThreadsPerEngine: 8,
        recommendedHashMb: 4096,
        maxSafeHashMb: 8192,
        syzygyReady: false,
        syzygyPieces: 0,
      },
    } as never;
    const result = await runSuite();
    expect(result.ok).toBe(false);
    expect(result.steps[0]!.reason).toBe("engine_version_unsupported");
    expect(result.steps.filter((s) => s.status === "skipped")).toHaveLength(5);
    expect(result.rows).toHaveLength(0);
  });

  it("fails closed when backend secrets are not configured", async () => {
    env.value = { configured: false, code: "private_key_invalid" } as never;
    const result = await runSuite();
    expect(result.reasons).toContain("secrets_private_key_invalid");
  });

  it("invalidates the run when the draft config changes mid-suite", async () => {
    draft.value = { multipv: 3 } as unknown as EngineConfig;
    const result = await runSuite();
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("config_changed_during_run");
    expect(result.readiness).toBeNull();
  });

  it("surfaces readiness reasons without duplicating them", async () => {
    readiness.value = { ready: false, reasons: ["missing_bench", "missing_bench"] };
    const result = await runSuite();
    expect(result.reasons.filter((r) => r === "missing_bench")).toHaveLength(1);
  });
});
