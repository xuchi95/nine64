import { describe, expect, it } from "vitest";
import { evaluateEngineContract, EXPECTED_BENCHMARK_SUITE_VERSION } from "./engineContract.server";
import { EXPECTED_ENGINE_SERVICE_VERSION } from "./engineContractTypes";
import type { CloudEngineHealth } from "./cloudEngine.server";
import type { EngineConfig } from "./profileTypes";

const capabilities = {
  cpuCount: 8,
  memoryMb: 16384,
  poolSize: 1,
  maxThreadsPerEngine: 8,
  recommendedHashMb: 4096,
  maxSafeHashMb: 8192,
  syzygyReady: false,
  syzygyPieces: 0,
};

function health(overrides: Partial<CloudEngineHealth> = {}): CloudEngineHealth {
  return {
    status: "healthy",
    engineVersion: "Stockfish 18",
    pool: { size: 1, busy: 0 },
    capabilities,
    benchmarkSuiteVersion: EXPECTED_BENCHMARK_SUITE_VERSION,
    serviceVersion: EXPECTED_ENGINE_SERVICE_VERSION,
    serviceBuildId: `${EXPECTED_ENGINE_SERVICE_VERSION}-abc123`,
    ...overrides,
  } as CloudEngineHealth;
}

const config = { threads: 8, hashMb: 4096, syzygyEnabled: false } as unknown as EngineConfig;

describe("engine deployment contract", () => {
  it("accepts a healthy, capability-complete Stockfish 18 running the expected suite", () => {
    const contract = evaluateEngineContract(health(), config);
    expect(contract.ok).toBe(true);
    expect(contract.deploymentCompatible).toBe(true);
    expect(contract.engineReady).toBe(true);
    expect(contract.code).toBeNull();
    expect(contract.serviceBuildId).toBe(`${EXPECTED_ENGINE_SERVICE_VERSION}-abc123`);
  });

  it("blocks when the deployed image reports no capabilities", () => {
    const contract = evaluateEngineContract(health({ capabilities: null }), config);
    expect(contract.ok).toBe(false);
    expect(contract.code).toBe("ENGINE_CAPABILITIES_UNAVAILABLE");
  });

  it("blocks when the engine ships a different benchmark suite", () => {
    const contract = evaluateEngineContract(
      health({ benchmarkSuiteVersion: "titan-v6-2" }),
      config,
    );
    expect(contract.ok).toBe(false);
    expect(contract.code).toBe("ENGINE_BENCHMARK_SUITE_MISMATCH");
  });

  it("treats a current starting deployment as compatible but not ready", () => {
    const contract = evaluateEngineContract(
      health({ status: "starting", engineVersion: null }),
      config,
    );
    expect(contract.ok).toBe(false);
    expect(contract.deploymentCompatible).toBe(true);
    expect(contract.engineReady).toBe(false);
    expect(contract.code).toBe("ENGINE_STARTING");
  });

  it("blocks missing or stale service identities", () => {
    expect(evaluateEngineContract(health({ serviceBuildId: null }), config).code).toBe(
      "SERVICE_BUILD_OUTDATED",
    );
    expect(
      evaluateEngineContract(health({ serviceBuildId: EXPECTED_ENGINE_SERVICE_VERSION }), config)
        .code,
    ).toBe("SERVICE_BUILD_OUTDATED");
    expect(evaluateEngineContract(health({ serviceVersion: null }), config).code).toBe(
      "SERVICE_BUILD_OUTDATED",
    );
    expect(evaluateEngineContract(health({ serviceBuildId: "old-image" }), config).code).toBe(
      "SERVICE_BUILD_OUTDATED",
    );
  });

  it("blocks a config that does not fit the reported hardware", () => {
    const tooBig = { threads: 64, hashMb: 4096, syzygyEnabled: false } as unknown as EngineConfig;
    const contract = evaluateEngineContract(health(), tooBig);
    expect(contract.ok).toBe(false);
    expect(contract.code).toBe("CONFIG_RESOURCE_MISMATCH");
    expect(contract.fit?.reasons).toContain("threads_exceed_cpu");
  });

  it("blocks a non-Stockfish-18 engine before capabilities are even considered", () => {
    const contract = evaluateEngineContract(health({ engineVersion: "Stockfish 16" }), config);
    expect(contract.code).toBe("ENGINE_VERSION_UNSUPPORTED");
  });

  it("skips the resource gate when no config is supplied", () => {
    expect(evaluateEngineContract(health()).ok).toBe(true);
  });
});
