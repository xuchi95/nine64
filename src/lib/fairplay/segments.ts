import type { MoveObservation } from "./types";

export interface SegmentFinding {
  /** Raw engine-match lift of the best window versus the rest of the game. */
  lift: number;
  /**
   * Noise-corrected strength of that window: how many standard deviations the
   * best window stands out compared with the same moves randomly reshuffled.
   * This is the number the model consumes.
   */
  z: number;
  from: number;
  to: number;
  windowMatch: number;
  restMatch: number;
}

const EMPTY: SegmentFinding = { lift: 0, z: 0, from: 0, to: 0, windowMatch: 0, restMatch: 0 };

interface Best {
  stat: number;
  lift: number;
  start: number;
  end: number;
  windowMatch: number;
  restMatch: number;
}

/** Best standardized window lift for a binary hit sequence. */
function bestWindow(hits: number[], minWindow: number): Best | null {
  const n = hits.length;
  const prefix = [0];
  for (let i = 0; i < n; i++) prefix.push(prefix[i]! + hits[i]!);
  const total = prefix[n]!;
  const p = total / n;
  const variance = Math.max(0.01, p * (1 - p));

  let best: Best | null = null;
  for (let start = 0; start + minWindow <= n; start++) {
    for (let end = start + minWindow; end <= n; end++) {
      const winLen = end - start;
      const restLen = n - winLen;
      if (restLen < minWindow) continue;
      const winMatch = (prefix[end]! - prefix[start]!) / winLen;
      const restMatch = (total - (prefix[end]! - prefix[start]!)) / restLen;
      const se = Math.sqrt(variance * (1 / winLen + 1 / restLen));
      const stat = (winMatch - restMatch) / se;
      if (!best || stat > best.stat) {
        best = { stat, lift: winMatch - restMatch, start, end, windowMatch: winMatch, restMatch };
      }
    }
  }
  return best;
}

function shuffle(arr: number[], rand: () => number): number[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Change-point detection for "engine switched on mid-game".
 *
 * Scanning every window and keeping the maximum inevitably finds a lift even in
 * random play, so the raw maximum is useless on its own. We therefore compare it
 * with a permutation null built from the very same moves: only a window that
 * beats what reshuffling produces counts as evidence.
 */
export function detectSegment(
  observations: MoveObservation[],
  minWindow = 6,
  permutations = 40,
): SegmentFinding {
  const n = observations.length;
  if (n < minWindow * 2) return EMPTY;

  const hits: number[] = observations.map((o) => (o.isTop1 ? 1 : 0));
  const best = bestWindow(hits, minWindow);
  if (!best) return EMPTY;

  // Deterministic RNG so the same game always yields the same report.
  let seed = (n * 2654435761 + hits.reduce((a, h, i) => a + h * (i + 1), 0)) >>> 0 || 1;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 4294967296;
  };

  const nulls: number[] = [];
  for (let i = 0; i < permutations; i++) {
    const b = bestWindow(shuffle(hits, rand), minWindow);
    if (b) nulls.push(b.stat);
  }
  const mean = nulls.reduce((a, b) => a + b, 0) / Math.max(1, nulls.length);
  const sd = Math.sqrt(
    nulls.reduce((a, s) => a + (s - mean) ** 2, 0) / Math.max(1, nulls.length - 1),
  );
  const z = sd <= 0 ? 0 : (best.stat - mean) / sd;

  return {
    lift: round(best.lift),
    z: round(z),
    from: observations[best.start]!.ply,
    to: observations[best.end - 1]!.ply,
    windowMatch: round(best.windowMatch),
    restMatch: round(best.restMatch),
  };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
