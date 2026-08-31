import { describe, expect, it } from "vitest";
import { tickTournament, type PlayerRecord, type TournamentRecord } from "./engine";
import { MemoryTournamentStore } from "./memoryStore";
import type { TournamentFormat } from "./types";

const T0 = new Date("2026-01-01T12:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

function makeStore(format: TournamentFormat, count: number, over: Partial<TournamentRecord> = {}) {
  const tournament: TournamentRecord = {
    id: "t1",
    format,
    status: "scheduled",
    variant: "standard",
    timeControl: "3+2",
    scoring: null,
    tiebreaks: ["buchholz", "sonneborn_berger", "wins"],
    startsAt: T0.toISOString(),
    registrationOpensAt: at(-60).toISOString(),
    endsAt: null,
    durationMinutes: 60,
    roundsTotal: 3,
    currentRound: 0,
    paused: false,
    lateJoin: true,
    ...over,
  };
  const players: PlayerRecord[] = Array.from({ length: count }, (_, i) => ({
    userId: `p${i + 1}`,
    rating: 1800 - i * 50,
    seed: i + 1,
    status: "active",
  }));
  return new MemoryTournamentStore(tournament, players);
}

/** Higher seed (lower seed number) always wins — makes results predictable. */
const seedWins = (store: MemoryTournamentStore) => (pairing: { whiteId: string | null; blackId: string | null }) => {
  const rank = (id: string | null) => store.players.find((p) => p.userId === id)?.seed ?? 99;
  return rank(pairing.whiteId) < rank(pairing.blackId) ? ("white" as const) : ("black" as const);
};

describe("tournament lifecycle", () => {
  it("opens registration, starts, and refuses to run with fewer than two players", async () => {
    const store = makeStore("swiss", 1);
    let res = await tickTournament(store, "t1", at(-70));
    expect(res.status).toBe("scheduled");
    res = await tickTournament(store, "t1", at(-30));
    expect(res.status).toBe("registration");
    res = await tickTournament(store, "t1", at(1));
    expect(res.status).toBe("cancelled");
    expect(store.events.map((e) => e.type)).toContain("cancelled_no_players");
  });

  it("does nothing while paused or in draft", async () => {
    const draft = makeStore("swiss", 4, { status: "draft" });
    expect((await tickTournament(draft, "t1", at(5))).actions).toEqual(["draft"]);
    const paused = makeStore("swiss", 4, { status: "running", paused: true });
    expect((await tickTournament(paused, "t1", at(5))).actions).toEqual(["idle"]);
  });
});

describe("swiss end to end", () => {
  it("runs three rounds, scores every game, and finishes with a ranked table", async () => {
    const store = makeStore("swiss", 4);
    await tickTournament(store, "t1", at(1));
    expect(store.tournament.status).toBe("running");
    expect(store.pairings.filter((p) => p.roundNumber === 1)).toHaveLength(2);

    for (let round = 1; round <= 3; round += 1) {
      expect(store.tournament.currentRound).toBe(round);
      store.finishOpenGames(seedWins(store));
      await tickTournament(store, "t1", at(1 + round * 5));
    }

    expect(store.tournament.status).toBe("finished");
    expect(store.pairings.filter((p) => p.status === "finished")).toHaveLength(6);
    expect(store.standings[0]!.userId).toBe("p1");
    expect(store.standings[0]!.score).toBe(3);
    expect(store.standings.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    // Every player played every round.
    for (const row of store.standings) expect(row.gamesPlayed).toBe(3);
  });

  it("hands out a bye and points for it with an odd field", async () => {
    const store = makeStore("swiss", 5, { roundsTotal: 1 });
    await tickTournament(store, "t1", at(1));
    const bye = store.pairings.find((p) => p.status === "bye");
    expect(bye).toBeDefined();
    expect(store.scores.filter((s) => s.outcome === "bye")).toHaveLength(1);
    store.finishOpenGames(seedWins(store));
    await tickTournament(store, "t1", at(6));
    expect(store.tournament.status).toBe("finished");
    const byeRow = store.standings.find((r) => r.userId === bye!.whiteId)!;
    expect(byeRow.byes).toBe(1);
    expect(byeRow.score).toBe(1);
  });

  it("treats an aborted game as void with no points", async () => {
    const store = makeStore("swiss", 2, { roundsTotal: 1 });
    await tickTournament(store, "t1", at(1));
    store.finishOpenGames(() => "abort");
    await tickTournament(store, "t1", at(6));
    expect(store.pairings[0]!.status).toBe("void");
    expect(store.standings.every((r) => r.score === 0)).toBe(true);
  });
});

describe("round robin end to end", () => {
  it("plays n-1 rounds and every player meets every other once", async () => {
    const store = makeStore("round_robin", 4, { roundsTotal: 0 });
    await tickTournament(store, "t1", at(1));
    for (let guard = 0; guard < 10 && store.tournament.status === "running"; guard += 1) {
      store.finishOpenGames(seedWins(store));
      await tickTournament(store, "t1", at(2 + guard * 5));
    }
    expect(store.tournament.status).toBe("finished");
    expect(store.rounds).toHaveLength(3);
    expect(store.pairings).toHaveLength(6);
    const met = new Set(
      store.pairings.map((p) => [p.whiteId, p.blackId].sort().join("-")),
    );
    expect(met.size).toBe(6);
    expect(store.standings[0]!.userId).toBe("p1");
  });
});

describe("knockout end to end", () => {
  it("halves the field each round and crowns one winner", async () => {
    const store = makeStore("knockout", 8, { roundsTotal: 0 });
    await tickTournament(store, "t1", at(1));
    expect(store.pairings.filter((p) => p.roundNumber === 1)).toHaveLength(4);
    for (let guard = 0; guard < 10 && store.tournament.status === "running"; guard += 1) {
      store.finishOpenGames(seedWins(store));
      await tickTournament(store, "t1", at(2 + guard * 5));
    }
    expect(store.tournament.status).toBe("finished");
    expect(store.rounds).toHaveLength(3);
    expect(store.pairings.filter((p) => p.roundNumber === 3)).toHaveLength(1);
    expect(store.standings[0]!.userId).toBe("p1");
  });
});

describe("arena end to end", () => {
  it("keeps pairing free players until the clock runs out, with streak bonuses", async () => {
    const store = makeStore("arena", 4, { durationMinutes: 20 });
    await tickTournament(store, "t1", at(1));
    expect(store.pairings).toHaveLength(2);
    expect(store.tournament.endsAt).toBe(at(20).toISOString());

    // p1 wins three in a row: 2 + 2 + 4 (streak multiplier from the third win).
    for (let wave = 0; wave < 3; wave += 1) {
      store.finishOpenGames(seedWins(store));
      await tickTournament(store, "t1", at(2 + wave * 3));
    }
    const p1 = store.standings.find((r) => r.userId === "p1")!;
    expect(p1.wins).toBe(3);
    expect(p1.score).toBe(8);

    store.finishOpenGames(seedWins(store));
    const done = await tickTournament(store, "t1", at(25));
    expect(done.status).toBe("finished");
    expect(store.standings[0]!.userId).toBe("p1");
  });
});

describe("idempotency", () => {
  it("re-ticking without new results changes nothing", async () => {
    const store = makeStore("swiss", 4);
    await tickTournament(store, "t1", at(1));
    const before = JSON.stringify({ p: store.pairings, s: store.scores });
    await tickTournament(store, "t1", at(1));
    await tickTournament(store, "t1", at(2));
    expect(JSON.stringify({ p: store.pairings, s: store.scores })).toBe(before);
  });

  it("does not double-score a pairing that was already settled", async () => {
    const store = makeStore("swiss", 2, { roundsTotal: 2 });
    await tickTournament(store, "t1", at(1));
    store.finishOpenGames(() => "white");
    await tickTournament(store, "t1", at(2));
    await tickTournament(store, "t1", at(3));
    expect(store.scores.filter((s) => s.userId === store.pairings[0]!.whiteId)).toHaveLength(1);
  });
});
