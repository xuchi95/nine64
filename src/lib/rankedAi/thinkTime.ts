/**
 * Human-like, DETERMINISTIC thinking delay for ranked AI opponents.
 *
 * Deterministic on (gameId, ply, rating) so a retry of the same move job never
 * changes the delay — exactly-once processing stays exactly-once. The delay is
 * a wall-clock pause the server takes before committing; it is charged to the
 * AI's own clock exactly like a human's thinking time.
 */

const MIN_DELAY_MS = 350;

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface ThinkDelayInput {
  gameId: string;
  ply: number;
  rating: number;
  /** Remaining clock of the AI side, in ms. */
  remainingMs: number;
  /** How long the engine search itself already took. */
  searchMs: number;
  pace: "realtime" | "daily";
}

/**
 * Total wall-clock time the AI should spend on this move, including the search
 * that already happened. Callers sleep for `max(0, total - searchMs)`.
 */
export function humanThinkDelayMs(input: ThinkDelayInput): number {
  const remaining = Math.max(0, input.remainingMs);
  if (remaining <= 0) return 0;

  // Never burn more than a small share of the remaining clock, and always
  // leave a safety margin so the AI cannot flag itself on its own delay.
  const share = input.pace === "daily" ? 0.02 : remaining < 20_000 ? 0.02 : 0.05;
  const cap = Math.max(0, Math.min(remaining - 1_000, Math.round(remaining * share), 12_000));
  if (cap <= 0) return 0;

  // Opening moves are fast, middlegame slower, endgame moderate.
  const phase = input.ply < 12 ? 0.35 : input.ply < 60 ? 1 : 0.7;
  // Stronger AIs answer a touch faster and more evenly, like a titled human.
  const strength = input.rating >= 2400 ? 0.75 : input.rating >= 1600 ? 0.9 : 1.1;

  const jitter = 0.6 + (hash32(`${input.gameId}:${input.ply}:${input.rating}`) % 800) / 1000;
  const wanted = Math.round(1_800 * phase * strength * jitter);

  const total = Math.min(cap, Math.max(MIN_DELAY_MS, wanted));
  return Math.max(0, Math.min(total, remaining - 500));
}

/** How long the caller must actually sleep after the engine returned. */
export function sleepAfterSearchMs(input: ThinkDelayInput): number {
  return Math.max(0, humanThinkDelayMs(input) - Math.max(0, input.searchMs));
}
