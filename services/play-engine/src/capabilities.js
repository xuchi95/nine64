/**
 * Runtime capability discovery for the Nine64 play-engine.
 *
 * Everything here is derived from the ACTUAL container the service runs in:
 * CPU count, cgroup memory limit, pool size and the Syzygy tablebase files
 * that really exist on disk. The result is exposed through /health so the
 * Nine64 backend can refuse a Titan configuration that does not fit the
 * hardware instead of silently clamping it.
 *
 * SAFETY: this module never exposes filesystem paths, env values, tokens or
 * credentials. `syzygyPath` stays inside the process; only readiness and the
 * maximum piece count leave it.
 *
 * Copyright (C) 2026 Nine64. GPL-3.0-or-later.
 */
import fs from "node:fs";
import os from "node:os";
import { BENCHMARK_SUITE_VERSION } from "./version.js";

export { BENCHMARK_SUITE_VERSION, SERVICE_BUILD_ID, SERVICE_VERSION } from "./version.js";

/** Tablebase file extensions written by the Syzygy generator. */
const TB_EXTENSIONS = [".rtbw", ".rtbz"];

export function cpuCount() {
  const parallelism = typeof os.availableParallelism === "function" ? os.availableParallelism() : 0;
  return Math.max(1, parallelism || os.cpus().length || 1);
}

/** Container/cgroup memory limit in MiB, falling back to host memory. */
export function memoryLimitMb() {
  const candidates = [
    "/sys/fs/cgroup/memory.max", // cgroup v2
    "/sys/fs/cgroup/memory/memory.limit_in_bytes", // cgroup v1
  ];
  for (const file of candidates) {
    try {
      const raw = fs.readFileSync(file, "utf8").trim();
      if (raw === "max") continue;
      const bytes = Number(raw);
      // cgroup v1 reports an absurd sentinel when unlimited.
      if (Number.isFinite(bytes) && bytes > 0 && bytes < Number.MAX_SAFE_INTEGER / 2) {
        return Math.floor(bytes / (1024 * 1024));
      }
    } catch {
      /* not available in this runtime */
    }
  }
  return Math.floor(os.totalmem() / (1024 * 1024));
}

/**
 * Hash headroom policy. Stockfish also needs memory for the NNUE net, thread
 * stacks and transient allocations, and Node plus the OS live in the same
 * container, so at most a quarter of the limit is offered as Hash.
 *   16 GiB -> 4096 MB, 32 GiB -> 8192 MB.
 */
export function recommendedHashMb(memoryMb = memoryLimitMb()) {
  const quarter = Math.floor(memoryMb / 4);
  // Never propose more than the limit minus a fixed 1 GiB working set.
  const ceiling = Math.max(16, memoryMb - 1024);
  return Math.max(16, Math.min(quarter, ceiling));
}

/** Absolute ceiling accepted for a config; above this a request is rejected. */
export function maxSafeHashMb(memoryMb = memoryLimitMb()) {
  return Math.max(16, Math.floor(memoryMb / 2));
}

function pieceCountFromName(name) {
  // Syzygy names look like KQvK, KRPvKR ...
  const base = name.replace(/\.(rtbw|rtbz)$/i, "");
  if (!/^[KQRBNP]+v[KQRBNP]+$/.test(base)) return 0;
  return base.replace("v", "").length;
}

/**
 * Inspects the configured tablebase directory. Returns readiness plus the
 * highest piece count actually present — never the path itself.
 */
export function inspectSyzygy(rawPath = process.env.SYZYGY_PATH) {
  const path = (rawPath ?? "").trim();
  const empty = {
    ready: false,
    pieces: 0,
    files: 0,
    reason: path ? "unreadable" : "not_configured",
  };
  if (!path) return empty;
  let entries;
  try {
    const stat = fs.statSync(path);
    if (!stat.isDirectory()) return { ...empty, reason: "not_a_directory" };
    fs.accessSync(path, fs.constants.R_OK);
    entries = fs.readdirSync(path);
  } catch {
    return empty;
  }
  let pieces = 0;
  let files = 0;
  for (const entry of entries) {
    if (!TB_EXTENSIONS.some((ext) => entry.toLowerCase().endsWith(ext))) continue;
    files += 1;
    pieces = Math.max(pieces, pieceCountFromName(entry));
  }
  if (!files || pieces < 3) return { ...empty, reason: "no_tablebase_files" };
  return { ready: true, pieces, files, reason: null };
}

/** Server-only accessor: the real path is used to set SyzygyPath on the engine. */
export function syzygyPath() {
  const path = (process.env.SYZYGY_PATH ?? "").trim();
  return path || null;
}

/**
 * The public, browser-safe capability block returned by /health.
 * `poolSize` is the number of Stockfish processes on this instance.
 */
export function capabilities(poolSize = Number(process.env.ENGINE_POOL_SIZE || 1)) {
  const cpus = cpuCount();
  const memoryMb = memoryLimitMb();
  const size = Math.max(1, Math.trunc(poolSize) || 1);
  const syzygy = inspectSyzygy();
  return {
    cpuCount: cpus,
    memoryMb,
    poolSize: size,
    maxThreadsPerEngine: Math.max(1, Math.floor(cpus / size)),
    recommendedHashMb: recommendedHashMb(memoryMb),
    maxSafeHashMb: maxSafeHashMb(memoryMb),
    syzygyReady: syzygy.ready,
    syzygyPieces: syzygy.ready ? syzygy.pieces : 0,
    benchmarkSuiteVersion: BENCHMARK_SUITE_VERSION,
  };
}
