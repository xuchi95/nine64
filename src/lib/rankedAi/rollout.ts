/**
 * Deterministic rollout bucketing for the Nine64 AI Player Network.
 * Same user + same percentage always lands in the same bucket, so the rollout
 * can be widened or rolled back without shuffling who is affected.
 */
export function rolloutBucket(userId: string): number {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i += 1) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100;
}

export function inRankedAiRollout(userId: string, percent: number): boolean {
  if (!Number.isFinite(percent) || percent <= 0) return false;
  if (percent >= 100) return true;
  return rolloutBucket(userId) < Math.floor(percent);
}
