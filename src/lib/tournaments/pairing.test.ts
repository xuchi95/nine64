import { describe, expect, it } from "vitest";
import {
  assignColours,
  pairArena,
  pairKnockoutFirstRound,
  pairKnockoutNextRound,
  pairRoundRobin,
  pairSwiss,
  seedOrder,
} from "./pairing";
import type { PairingPlayer } from "./types";

function player(id: string, over: Partial<PairingPlayer> = {}): PairingPlayer {
  return {
    userId: id,
    score: 0,
    rating: 1500,
    seed: 1,
    colourBalance: 0,
    lastColour: null,
    byes: 0,
    opponents: [],
    active: true,
    ...over,
  };
}

describe("swiss pairing", () => {
  it("pairs the field by score and is deterministic", () => {
    const field = [
      player("a", { score: 2, rating: 1700, seed: 1 }),
      player("b", { score: 2, rating: 1600, seed: 2 }),
      player("c", { score: 1, rating: 1500, seed: 3 }),
      player("d", { score: 0, rating: 1400, seed: 4 }),
    ];
    const first = pairSwiss(field);
    const second = pairSwiss([...field].reverse());
    expect(first.slots).toEqual(second.slots);
    expect(first.slots).toHaveLength(2);
    expect(new Set([first.slots[0]!.whiteId, first.slots[0]!.blackId])).toEqual(new Set(["a", "b"]));
  });

  it("avoids a rematch when a rematch-free pairing exists", () => {
    const field = [
      player("a", { score: 1, opponents: ["b"] }),
      player("b", { score: 1, opponents: ["a"] }),
      player("c", { score: 1, opponents: ["d"] }),
      player("d", { score: 1, opponents: ["c"] }),
    ];
    const { slots, rematchForced } = pairSwiss(field);
    expect(rematchForced).toBe(false);
    for (const slot of slots) {
      const pair = new Set([slot.whiteId, slot.blackId]);
      expect(pair).not.toEqual(new Set(["a", "b"]));
      expect(pair).not.toEqual(new Set(["c", "d"]));
    }
  });

  it("reports a forced rematch when the field leaves no alternative", () => {
    const field = [
      player("a", { opponents: ["b"] }),
      player("b", { opponents: ["a"] }),
    ];
    expect(pairSwiss(field).rematchForced).toBe(true);
  });

  it("gives the bye to the lowest scorer who has had the fewest byes", () => {
    const field = [
      player("a", { score: 3 }),
      player("b", { score: 2 }),
      player("c", { score: 1, byes: 1 }),
      player("d", { score: 0, byes: 1 }),
      player("e", { score: 0, byes: 0 }),
    ];
    const { byeUserId, slots } = pairSwiss(field);
    expect(byeUserId).toBe("e");
    expect(slots.at(-1)).toMatchObject({ status: "bye", whiteId: "e", blackId: null });
  });

  it("balances colours", () => {
    const a = player("a", { colourBalance: 2 });
    const b = player("b", { colourBalance: -1 });
    expect(assignColours(a, b)).toEqual({ whiteId: "b", blackId: "a" });
    const { slots } = pairSwiss([a, b]);
    expect(slots[0]).toMatchObject({ whiteId: "b", blackId: "a" });
  });

  it("skips withdrawn players", () => {
    const { slots } = pairSwiss([
      player("a"),
      player("b"),
      player("c", { active: false }),
    ]);
    expect(slots).toHaveLength(1);
    expect(slots[0]!.blackId).not.toBeNull();
  });
});

describe("round robin (Berger)", () => {
  it("has every player meet every other exactly once", () => {
    const field = ["a", "b", "c", "d", "e", "f"].map((id, i) =>
      player(id, { seed: i + 1, rating: 1600 - i }),
    );
    const met = new Map<string, Set<string>>(field.map((p) => [p.userId, new Set<string>()]));
    for (let round = 1; round <= 5; round += 1) {
      const slots = pairRoundRobin(field, round);
      expect(slots).toHaveLength(3);
      for (const s of slots) {
        expect(met.get(s.whiteId!)!.has(s.blackId!)).toBe(false);
        met.get(s.whiteId!)!.add(s.blackId!);
        met.get(s.blackId!)!.add(s.whiteId!);
      }
    }
    for (const set of met.values()) expect(set.size).toBe(5);
  });

  it("hands out one bye per round with an odd field", () => {
    const field = ["a", "b", "c", "d", "e"].map((id, i) => player(id, { seed: i + 1 }));
    const byes: string[] = [];
    for (let round = 1; round <= 5; round += 1) {
      const slots = pairRoundRobin(field, round);
      const bye = slots.find((s) => s.status === "bye");
      expect(bye).toBeDefined();
      byes.push(bye!.whiteId!);
    }
    expect(new Set(byes).size).toBe(5);
  });
});

describe("knockout", () => {
  it("builds the standard seeded bracket", () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const field = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => player(`p${n}`, { seed: n, rating: 2000 - n }));
    const slots = pairKnockoutFirstRound(field);
    expect(slots).toHaveLength(4);
    expect(new Set([slots[0]!.whiteId, slots[0]!.blackId])).toEqual(new Set(["p1", "p8"]));
    expect(new Set([slots[1]!.whiteId, slots[1]!.blackId])).toEqual(new Set(["p4", "p5"]));
  });

  it("gives byes when the field is not a power of two", () => {
    const field = [1, 2, 3, 4, 5].map((n) => player(`p${n}`, { seed: n, rating: 2000 - n }));
    const slots = pairKnockoutFirstRound(field);
    expect(slots).toHaveLength(4);
    expect(slots.filter((s) => s.status === "bye")).toHaveLength(3);
  });

  it("advances winners in bracket order", () => {
    const field = [1, 2, 3, 4].map((n) => player(`p${n}`, { seed: n, rating: 2000 - n }));
    const round1 = pairKnockoutFirstRound(field).map((s) => ({
      ...s,
      status: "finished" as const,
      result: "white" as const,
    }));
    const winners = round1.map((s) => field.find((p) => p.userId === s.whiteId)!);
    const round2 = pairKnockoutNextRound(winners, round1);
    expect(round2).toHaveLength(1);
    expect(new Set([round2[0]!.whiteId, round2[0]!.blackId])).toEqual(
      new Set([round1[0]!.whiteId, round1[1]!.whiteId]),
    );
  });
});

describe("arena", () => {
  it("pairs free players by score and prefers a fresh opponent", () => {
    const slots = pairArena([
      player("a", { score: 6, opponents: ["b"] }),
      player("b", { score: 5, opponents: ["a"] }),
      player("c", { score: 4 }),
      player("d", { score: 3 }),
    ]);
    expect(slots).toHaveLength(2);
    expect(new Set([slots[0]!.whiteId, slots[0]!.blackId])).toEqual(new Set(["a", "c"]));
    expect(new Set([slots[1]!.whiteId, slots[1]!.blackId])).toEqual(new Set(["b", "d"]));
  });

  it("leaves an odd player waiting instead of inventing a bye", () => {
    const slots = pairArena([player("a"), player("b"), player("c")]);
    expect(slots).toHaveLength(1);
  });
});
