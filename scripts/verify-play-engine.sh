#!/usr/bin/env bash
set -euo pipefail

EXPECTED_SUITE="${EXPECTED_SUITE:-titan-v6-3}"
EXPECTED_SERVICE_VERSION="${EXPECTED_SERVICE_VERSION:-play-engine-titan-v6.3}"
PLAY_ENGINE_URL="${PLAY_ENGINE_URL:-${1:-}}"

fail() { printf 'DEPLOYMENT CONTRACT FAILED: %s\n' "$1" >&2; exit 1; }
command -v node >/dev/null || fail "node is required"
command -v curl >/dev/null || fail "curl is required"
test -n "$PLAY_ENGINE_URL" || fail "set PLAY_ENGINE_URL or pass the service URL"

headers=()
if command -v gcloud >/dev/null; then
  token="$(gcloud auth print-identity-token --audiences="$PLAY_ENGINE_URL" 2>/dev/null || true)"
  if test -n "$token"; then headers=(-H "Authorization: Bearer $token"); fi
fi

payload="$(curl --fail-with-body --silent --show-error "${headers[@]}" "$PLAY_ENGINE_URL/health")" || \
  fail "health request failed (private services require an identity allowed by run.invoker)"

HEALTH_PAYLOAD="$payload" EXPECTED_SUITE="$EXPECTED_SUITE" EXPECTED_SERVICE_VERSION="$EXPECTED_SERVICE_VERSION" node <<'NODE'
const fail = (reason) => { console.error(`DEPLOYMENT CONTRACT FAILED: ${reason}`); process.exit(1); };
let h;
try { h = JSON.parse(process.env.HEALTH_PAYLOAD || ""); } catch { fail("invalid health JSON"); }
if (h.status !== "ok") fail(`engine status is ${h.status || "missing"}`);
if (!/stockfish\s*18/i.test(h.engineVersion || "")) fail("Stockfish 18 not reported");
if (h.benchmarkSuiteVersion !== process.env.EXPECTED_SUITE) fail("benchmark suite mismatch");
if (h.serviceVersion !== process.env.EXPECTED_SERVICE_VERSION) fail("service version mismatch");
if (typeof h.serviceBuildId !== "string" || !h.serviceBuildId.startsWith(`${process.env.EXPECTED_SERVICE_VERSION}-`)) fail("build ID missing or stale");
const c = h.capabilities;
if (!c || c.cpuCount < 8 || c.memoryMb < 16384 || c.poolSize !== 1 || c.maxThreadsPerEngine < 8 || c.maxSafeHashMb < 4096) fail("resource capabilities do not satisfy Titan v6 Max");
if (!h.pool || h.pool.size !== 1) fail("engine pool must be exactly 1");
console.log(`DEPLOYMENT CONTRACT PASSED: ${h.serviceBuildId} · ${h.engineVersion}`);
NODE