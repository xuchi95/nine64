/**
 * Deterministic pairing algorithms.
 *
 * Every function here is pure: the same players and round number always
 * produce byte-identical pairings, which is what makes the scheduler safe to
 * retry — a job that runs twice recomputes the same boards, and the database's
 * unique (tournament, round, board) key absorbs the duplicate.
 */

import type { PairingPlayer, PairingSlot } from "./types";

/** Stable ordering used everywhere: score, then rating, then id. */
export function orderByScore(players: readonly PairingPlayer[]): PairingPlayer[] {
  return [...players].sort(
    (a, b) => b.score - a.score || b.rating - a.rating || (a.userId < b.userId ? -1 : 1),
  );
}

/** Stable seeding order: explicit seed, then rating, then id. */
export function orderBySeed(players: readonly PairingPlayer[]): PairingPlayer[] {
  return [...players].sort(
    (a, b) => a.seed - b.seed || b.rating - a.rating || (a.userId < b.userId ? -1 : 1),
  );
}

/**
 * Colour balancing: the player who owes a white gets white. Ties fall back to
 * alternating from the previous game, then to the stronger score.
 */
export function assignColours(a: PairingPlayer, b: PairingPlayer): { whiteId: string; blackId: string } {
  const white = (p: PairingPlayer, q: PairingPlayer) => ({ whiteId: p.userId, blackId: q.userId });
  if (a.colourBalance !== b.colourBalance) {
    return a.colourBalance < b.colourBalance ? white(a, b) : white(b, a);
  }
  if (a.lastColour !== b.lastColour) {
    if (a.lastColour === "b") return white(a, b);
    if (b.lastColour === "b") return white(b, a);
  }
  if (a.score !== b.score) return a.score > b.score ? white(a, b) : white(b, a);
  return a.userId < b.userId ? white(a, b) : white(b, a);
}

/** Lowest-ranked player with the fewest byes so far receives the bye. */
export function pickByePlayer(ordered: readonly PairingPlayer[]): PairingPlayer | null {
  if (ordered.length === 0) return null;
  let best = ordered[ordered.length - 1]!;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const p = ordered[i]!;
    if (p.byes < best.byes) best = p;
  }
  return best;
}

function hasMet(a: PairingPlayer, b: PairingPlayer): boolean {
  return a.opponents.includes(b.userId) || b.opponents.includes(a.userId);
}

/**
 * Pair a score-ordered list, refusing rematches when a rematch-free perfect
 * matching exists. Backtracking is bounded so a pathological field degrades to
 * "allow rematches" instead of hanging the scheduler.
 */
function matchWithoutRematch(pool: PairingPlayer[]): [PairingPlayer, PairingPlayer][] | null {
  const result: [PairingPlayer, PairingPlayer][] = [];
  let budget = 20000;

  const solve = (rest: PairingPlayer[]): boolean => {
    if (rest.length === 0) return true;
    if (budget-- <= 0) return false;
    const [head, ...tail] = rest as [PairingPlayer, ...PairingPlayer[]];
    for (let i = 0; i < tail.length; i += 1) {
      const candidate = tail[i]!;
      if (hasMet(head, candidate)) continue;
      result.push([head, candidate]);
      const next = tail.filter((_, idx) => idx !== i);
      if (solve(next)) return true;
      result.pop();
    }
    return false;
  };

  return solve(pool) ? result : null;
}

/** Fallback that simply pairs neighbours, used when rematches are unavoidable. */
function matchGreedy(pool: PairingPlayer[]): [PairingPlayer, PairingPlayer][] {
  const out: [PairingPlayer, PairingPlayer][] = [];
  for (let i = 0; i + 1 < pool.length; i += 2) out.push([pool[i]!, pool[i + 1]!]);
  return out;
}

export interface SwissPairingResult {
  slots: PairingSlot[];
  byeUserId: string | null;
  /** True when the field forced at least one repeat pairing. */
  rematchForced: boolean;
}

/** Swiss: score groups, no rematch when avoidable, colour balanced, one bye. */
export function pairSwiss(players: readonly PairingPlayer[]): SwissPairingResult {
  const field = orderByScore(players.filter((p) => p.active));
  let byeUserId: string | null = null;
  let pool = field;

  if (pool.length % 2 === 1) {
    const bye = pickByePlayer(pool);
    byeUserId = bye?.userId ?? null;
    pool = pool.filter((p) => p.userId !== byeUserId);
  }

  const perfect = matchWithoutRematch(pool);
  const pairs = perfect ?? matchGreedy(pool);
  const slots: PairingSlot[] = pairs.map(([a, b], idx) => {
    const { whiteId, blackId } = assignColours(a, b);
    return { board: idx + 1, whiteId, blackId, status: "pending", result: null };
  });

  if (byeUserId) {
    slots.push({
      board: slots.length + 1,
      whiteId: byeUserId,
      blackId: null,
      status: "bye",
      result: "bye",
    });
  }

  return { slots, byeUserId, rematchForced: perfect === null && pool.length > 0 };
}

/**
 * Round robin using the Berger/circle construction: player 1 is fixed and the
 * rest rotate, so every player meets every other exactly once over n-1 rounds
 * (n rounds with a bye when the field is odd).
 */
export function pairRoundRobin(players: readonly PairingPlayer[], round: number): PairingSlot[] {
  const field = orderBySeed(players.filter((p) => p.active));
  if (field.length < 2) return [];
  const ids: (PairingPlayer | null)[] = [...field];
  if (ids.length % 2 === 1) ids.push(null); // null = bye marker

  const n = ids.length;
  const totalRounds = n - 1;
  const r = ((round - 1) % totalRounds + totalRounds) % totalRounds;

  const fixed = ids[0]!;
  const rotating = ids.slice(1);
  // Rotate right by r: classic Berger rotation.
  const rotated = rotating.map((_, i) => rotating[(i - r + rotating.length * 2) % rotating.length]!);
  const left = [fixed, ...rotated.slice(0, n / 2 - 1)];
  const right = rotated.slice(n / 2 - 1).reverse();

  const slots: PairingSlot[] = [];
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i] ?? null;
    const b = right[i] ?? null;
    if (!a || !b) {
      const solo = a ?? b;
      if (solo) {
        slots.push({
          board: slots.length + 1,
          whiteId: solo.userId,
          blackId: null,
          status: "bye",
          result: "bye",
        });
      }
      continue;
    }
    // Berger colour alternation: the board-1 pair swaps colours each round.
    const swap = (r + i) % 2 === 1;
    slots.push({
      board: slots.length + 1,
      whiteId: swap ? b.userId : a.userId,
      blackId: swap ? a.userId : b.userId,
      status: "pending",
      result: null,
    });
  }
  return slots;
}

/** Standard bracket seeding order for a power-of-two draw (1v8, 4v5, 2v7...). */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const round = order.length * 2 + 1;
    const next: number[] = [];
    for (const s of order) {
      next.push(s, round - s);
    }
    order = next;
  }
  return order;
}

/** First knockout round: seeded bracket padded to a power of two with byes. */
export function pairKnockoutFirstRound(players: readonly PairingPlayer[]): PairingSlot[] {
  const field = orderBySeed(players.filter((p) => p.active));
  if (field.length < 2) return [];
  let size = 1;
  while (size < field.length) size *= 2;
  const order = seedOrder(size);

  const slots: PairingSlot[] = [];
  for (let i = 0; i < order.length; i += 2) {
    const a = field[order[i]! - 1] ?? null;
    const b = field[order[i + 1]! - 1] ?? null;
    const board = slots.length + 1;
    if (a && b) {
      const { whiteId, blackId } = assignColours(a, b);
      slots.push({ board, whiteId, blackId, status: "pending", result: null, bracketSlot: board });
    } else if (a || b) {
      slots.push({
        board,
        whiteId: (a ?? b)!.userId,
        blackId: null,
        status: "bye",
        result: "bye",
        bracketSlot: board,
      });
    }
  }
  return slots;
}

/** Later knockout rounds: winners meet in bracket order. */
export function pairKnockoutNextRound(
  winners: readonly PairingPlayer[],
  previousSlots: readonly PairingSlot[],
): PairingSlot[] {
  const byId = new Map(winners.map((w) => [w.userId, w]));
  const ordered = [...previousSlots]
    .sort((a, b) => (a.bracketSlot ?? a.board) - (b.bracketSlot ?? b.board))
    .map((slot) => {
      const w = slot.result === "black" ? slot.blackId : slot.whiteId;
      return w ? byId.get(w) ?? null : null;
    })
    .filter((p): p is PairingPlayer => p !== null);

  const slots: PairingSlot[] = [];
  for (let i = 0; i < ordered.length; i += 2) {
    const a = ordered[i]!;
    const b = ordered[i + 1] ?? null;
    const board = slots.length + 1;
    if (!b) {
      slots.push({ board, whiteId: a.userId, blackId: null, status: "bye", result: "bye", bracketSlot: board });
      continue;
    }
    const { whiteId, blackId } = assignColours(a, b);
    slots.push({ board, whiteId, blackId, status: "pending", result: null, bracketSlot: board });
  }
  return slots;
}

/**
 * Arena: pair whoever is free right now, strongest scores first, skipping an
 * immediate rematch by shifting one place down when that is possible.
 */
export function pairArena(freePlayers: readonly PairingPlayer[]): PairingSlot[] {
  const pool = orderByScore(freePlayers.filter((p) => p.active));
  const slots: PairingSlot[] = [];
  const used = new Set<string>();

  for (let i = 0; i < pool.length; i += 1) {
    const a = pool[i]!;
    if (used.has(a.userId)) continue;
    let partner: PairingPlayer | null = null;
    let fallback: PairingPlayer | null = null;
    for (let j = i + 1; j < pool.length; j += 1) {
      const b = pool[j]!;
      if (used.has(b.userId)) continue;
      if (!fallback) fallback = b;
      if (!hasMet(a, b)) {
        partner = b;
        break;
      }
    }
    const chosen = partner ?? fallback;
    if (!chosen) break;
    used.add(a.userId);
    used.add(chosen.userId);
    const { whiteId, blackId } = assignColours(a, chosen);
    slots.push({ board: slots.length + 1, whiteId, blackId, status: "pending", result: null });
  }
  return slots;
}
