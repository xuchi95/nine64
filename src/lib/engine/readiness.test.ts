import { describe, expect, it } from "vitest";
import { evaluateReadiness, latestBenchmarkByKind } from "./readiness";
import { canonicalConfigJson, engineConfigFingerprint } from "./configFingerprint";
import { TITAN_FALLBACK_CONFIG } from "./profileTypes";
import type { BenchmarkRow } from "./benchmarkTypes";

const SIG = await engineConfigFingerprint(TITAN_FALLBACK_CONFIG);

function row(over: Partial<BenchmarkRow> & { kind: BenchmarkRow["kind"]; createdAt: string }): BenchmarkRow {
  return {
    id: `${over.kind}-${over.createdAt}`,
    profileSlug: "nine64-titan",
    profileVersion: 2,
    engineVersion: "Stockfish 18",
    hardware: {},
    nodes: null,
    nps: null,
    depth: null,
    score: null,
    passed: true,
    result: {},
    configSignature: SIG,
    ...over,
  };
}

describe("publish readiness", () => {
  it("A. no benchmarks -> missing_bench + missing_tactics", () => {
    const r = evaluateReadiness([], SIG);
    expect(r.ready).toBe(false);
    expect(r.reasons.sort()).toEqual(["missing_bench", "missing_tactics"]);
    expect(r.required.bench.present).toBe(false);
  });

  it("B. latest bench + epd passed -> ready", () => {
    const r = evaluateReadiness(
      [row({ kind: "bench", createdAt: "2026-09-01T10:00:00Z" }), row({ kind: "epd", createdAt: "2026-09-01T10:05:00Z" })],
      SIG,
    );
    expect(r).toMatchObject({ ready: true, reasons: [] });
    expect(r.required.epd.id).toBe("epd-2026-09-01T10:05:00Z");
  });

  it("C. old EPD failed, newest EPD passed -> ready", () => {
    const r = evaluateReadiness(
      [
        row({ kind: "bench", createdAt: "2026-09-01T10:00:00Z" }),
        row({ kind: "epd", createdAt: "2026-08-01T10:00:00Z", passed: false }),
        row({ kind: "epd", createdAt: "2026-09-01T10:05:00Z" }),
      ],
      SIG,
    );
    expect(r.ready).toBe(true);
  });

  it("D. old EPD with illegal moves does not block a clean newest EPD", () => {
    const r = evaluateReadiness(
      [
        row({ kind: "bench", createdAt: "2026-09-01T10:00:00Z" }),
        row({ kind: "epd", createdAt: "2026-08-01T10:00:00Z", passed: false, result: { illegalMoves: 1 } }),
        row({ kind: "epd", createdAt: "2026-09-01T10:05:00Z", result: { illegalMoves: 0 } }),
      ],
      SIG,
    );
    expect(r.reasons).not.toContain("illegal_moves");
    expect(r.ready).toBe(true);
  });

  it("E. latest EPD with illegal moves blocks publishing", () => {
    const r = evaluateReadiness(
      [
        row({ kind: "bench", createdAt: "2026-09-01T10:00:00Z" }),
        row({ kind: "epd", createdAt: "2026-09-02T10:00:00Z", passed: false, result: { illegalMoves: 2 } }),
      ],
      SIG,
    );
    expect(r.ready).toBe(false);
    expect(r.reasons).toContain("illegal_moves");
    expect(r.reasons).toContain("tactics_failed");
    expect(new Set(r.reasons).size).toBe(r.reasons.length);
  });

  it("F. latest bench failed -> bench_failed", () => {
    const r = evaluateReadiness(
      [
        row({ kind: "bench", createdAt: "2026-09-02T10:00:00Z", passed: false }),
        row({ kind: "epd", createdAt: "2026-09-02T10:05:00Z" }),
      ],
      SIG,
    );
    expect(r.reasons).toEqual(["bench_failed"]);
  });

  it("G. benchmarks from a different config fingerprint -> benchmark_config_mismatch", async () => {
    const other = await engineConfigFingerprint({
      ...TITAN_FALLBACK_CONFIG,
      threads: TITAN_FALLBACK_CONFIG.threads + 1,
    });
    expect(other).not.toBe(SIG);
    const r = evaluateReadiness(
      [
        row({ kind: "bench", createdAt: "2026-09-01T10:00:00Z" }),
        row({ kind: "epd", createdAt: "2026-09-01T10:05:00Z" }),
      ],
      other,
    );
    expect(r.ready).toBe(false);
    expect(r.reasons).toEqual(["benchmark_config_mismatch"]);
  });

  it("H. legacy rows without a fingerprint are stale for a config-scoped publish", () => {
    const rows = [
      row({ kind: "bench", createdAt: "2026-09-01T10:00:00Z", configSignature: null }),
      row({ kind: "epd", createdAt: "2026-09-01T10:05:00Z", configSignature: null }),
    ];
    expect(evaluateReadiness(rows, SIG).reasons).toEqual(["benchmark_stale"]);
    // Without a config to compare against, fingerprints are not enforced.
    expect(evaluateReadiness(rows, null).ready).toBe(true);
  });

  it("keeps the latest passing run for the requested fingerprint when another draft ran later", async () => {
    const other = await engineConfigFingerprint({
      ...TITAN_FALLBACK_CONFIG,
      threads: TITAN_FALLBACK_CONFIG.threads + 1,
    });
    const r = evaluateReadiness(
      [
        row({ kind: "bench", createdAt: "2026-09-01T10:00:00Z" }),
        row({ kind: "epd", createdAt: "2026-09-01T10:01:00Z" }),
        row({ kind: "bench", createdAt: "2026-09-02T10:00:00Z", configSignature: other, passed: false }),
        row({ kind: "epd", createdAt: "2026-09-02T10:01:00Z", configSignature: other, passed: false }),
      ],
      SIG,
    );
    expect(r.ready).toBe(true);
    expect(r.required.bench.id).toBe("bench-2026-09-01T10:00:00Z");
    expect(r.required.epd.id).toBe("epd-2026-09-01T10:01:00Z");
  });

  it("timeouts and engine errors on the latest run are reported distinctly", () => {
    const r = evaluateReadiness(
      [
        row({ kind: "bench", createdAt: "2026-09-01T10:00:00Z" }),
        row({ kind: "epd", createdAt: "2026-09-01T10:05:00Z", passed: false, result: { timeouts: 1, engineErrors: 1 } }),
      ],
      SIG,
    );
    expect(r.reasons).toContain("benchmark_timeout");
    expect(r.reasons).toContain("benchmark_engine_error");
    expect(r.reasons).not.toContain("illegal_moves");
  });

  it("latestBenchmarkByKind ignores input ordering", () => {
    const map = latestBenchmarkByKind([
      row({ kind: "epd", createdAt: "2026-09-01T10:05:00Z" }),
      row({ kind: "epd", createdAt: "2026-09-03T10:05:00Z" }),
      row({ kind: "epd", createdAt: "2026-08-01T10:05:00Z" }),
    ]);
    expect(map.get("epd")?.createdAt).toBe("2026-09-03T10:05:00Z");
  });

  it("config fingerprints are deterministic and key-order independent", async () => {
    const reordered = Object.fromEntries(
      Object.entries(TITAN_FALLBACK_CONFIG as unknown as Record<string, unknown>).reverse(),
    ) as typeof TITAN_FALLBACK_CONFIG;
    expect(canonicalConfigJson(reordered)).toBe(canonicalConfigJson(TITAN_FALLBACK_CONFIG));
    expect(await engineConfigFingerprint(reordered)).toBe(SIG);
    expect(SIG).toMatch(/^[0-9a-f]{64}$/);
  });

  it("draft change regression: config A benchmarks never qualify config B", async () => {
    const configA = TITAN_FALLBACK_CONFIG;
    const configB = { ...TITAN_FALLBACK_CONFIG, hashMb: TITAN_FALLBACK_CONFIG.hashMb * 2 };
    const sigA = await engineConfigFingerprint(configA);
    const sigB = await engineConfigFingerprint(configB);
    expect(sigA).not.toBe(sigB);

    const runsForA = [
      row({ kind: "bench", createdAt: "2026-09-01T10:00:00Z", configSignature: sigA }),
      row({ kind: "epd", createdAt: "2026-09-01T10:05:00Z", configSignature: sigA }),
    ];
    // A is publishable, B is not — even though green rows exist.
    expect(evaluateReadiness(runsForA, sigA).ready).toBe(true);
    expect(evaluateReadiness(runsForA, sigB)).toMatchObject({
      ready: false,
      reasons: ["benchmark_config_mismatch"],
    });

    const runsForB = [
      ...runsForA,
      row({ kind: "bench", createdAt: "2026-09-02T10:00:00Z", configSignature: sigB }),
      row({ kind: "epd", createdAt: "2026-09-02T10:05:00Z", configSignature: sigB }),
    ];
    expect(evaluateReadiness(runsForB, sigB).ready).toBe(true);
  });
});
