/**
 * The tournament engine: one pure state machine driven by a storage port.
 *
 * The engine never talks to Supabase directly — it calls a `TournamentStore`.
 * That keeps the whole lifecycle (registration, pairing, scoring, finishing)
 * unit-testable end to end with an in-memory store, and it keeps every write
 * behind an idempotent RPC so a retried worker converges instead of
 * duplicating rounds, games or points.
 */

import {
  pairArena,
  pairKnockoutFirstRound,
  pairKnockoutNextRound,
  pairRoundRobin,
  pairSwiss,
} from "./pairing";
import { computeStandings, scorePairing } from "./scoring";
import {
  resolveScoring,
  type PairingPlayer,
  type PairingResult,
  type PairingSlot,
  type StandingRow,
  type TournamentFormat,
  type TournamentStatus,
} from "./types";

export interface TournamentRecord {
  id: string;
  format: TournamentFormat;
  status: TournamentStatus;
  variant: string;
  timeControl: string;
  scoring: Record<string, unknown> | null;
  tiebreaks: string[];
  startsAt: string;
  registrationOpensAt: string | null;
  endsAt: string | null;
  durationMinutes: number;
  roundsTotal: number;
  currentRound: number;
  paused: boolean;
  lateJoin: boolean;
}

export interface PlayerRecord {
  userId: string;
  rating: number;
  seed: number;
  status: "active" | "withdrawn" | "removed";
}

export interface RoundRecord {
  id: string;
  number: number;
  status: "pairing" | "running" | "finished";
}

export interface PairingRecord {
  id: string;
  roundNumber: number;
  board: number;
  whiteId: string | null;
  blackId: string | null;
  gameId: string | null;
  status: "pending" | "active" | "finished" | "bye" | "void";
  result: PairingResult | null;
  bracketSlot: number | null;
}

export interface ScoreRecord {
  pairingId: string;
  userId: string;
  points: number;
  outcome: "win" | "draw" | "loss" | "bye" | "void";
}

export interface GameStateRecord {
  id: string;
  status: string;
  /** "white" | "black" | "draw" | "*" style result from the games table. */
  result: string | null;
  winnerId: string | null;
}

export interface TournamentSnapshot {
  tournament: TournamentRecord;
  players: PlayerRecord[];
  rounds: RoundRecord[];
  pairings: PairingRecord[];
  scores: ScoreRecord[];
}

export interface ScoreWriteRow {
  user_id: string;
  points: number;
  base_points: number;
  bonus_points: number;
  outcome: string;
  reason: string;
}

export interface TournamentStore {
  loadSnapshot(tournamentId: string): Promise<TournamentSnapshot | null>;
  setStatus(tournamentId: string, status: TournamentStatus, patch?: Record<string, unknown>): Promise<void>;
  openRound(tournamentId: string, number: number): Promise<{ roundId: string; created: boolean }>;
  applyPairings(tournamentId: string, roundNumber: number, slots: PairingSlot[]): Promise<void>;
  startGame(pairingId: string, initialFen: string): Promise<void>;
  loadGames(gameIds: string[]): Promise<GameStateRecord[]>;
  recordResult(pairingId: string, result: PairingResult, rows: ScoreWriteRow[]): Promise<void>;
  setStandings(tournamentId: string, rows: StandingRow[]): Promise<void>;
  logEvent(tournamentId: string, type: string, payload: Record<string, unknown>): Promise<void>;
  finishRound(roundId: string): Promise<void>;
}

export const STANDARD_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export interface TickResult {
  status: TournamentStatus;
  actions: string[];
  standings: StandingRow[];
}

function toPairingPlayers(
  players: PlayerRecord[],
  pairings: PairingRecord[],
  standings: StandingRow[],
): PairingPlayer[] {
  const byUser = new Map(standings.map((s) => [s.userId, s]));
  return players.map((p) => {
    const s = byUser.get(p.userId);
    const opponents: string[] = [];
    for (const pr of pairings) {
      if (pr.status === "void") continue;
      if (pr.whiteId === p.userId && pr.blackId) opponents.push(pr.blackId);
      if (pr.blackId === p.userId && pr.whiteId) opponents.push(pr.whiteId);
    }
    const last = [...pairings]
      .filter((pr) => pr.whiteId === p.userId || pr.blackId === p.userId)
      .sort((a, b) => a.roundNumber - b.roundNumber || a.board - b.board)
      .pop();
    return {
      userId: p.userId,
      score: s?.score ?? 0,
      rating: p.rating,
      seed: p.seed,
      colourBalance: s?.colourBalance ?? 0,
      lastColour: last ? (last.whiteId === p.userId ? "w" : "b") : null,
      byes: s?.byes ?? 0,
      opponents,
      active: p.status === "active",
    };
  });
}

function standingsFor(snap: TournamentSnapshot): StandingRow[] {
  const index = new Map(snap.pairings.map((p, i) => [p.id, i]));
  return computeStandings({
    players: snap.players.map((p) => ({ userId: p.userId, rating: p.rating, seed: p.seed })),
    pairings: snap.pairings.map((p) => ({
      roundNumber: p.roundNumber,
      whiteId: p.whiteId,
      blackId: p.blackId,
      result: p.result,
      status: p.status,
    })),
    scores: snap.scores.map((s) => ({
      userId: s.userId,
      pairingIndex: index.get(s.pairingId) ?? 0,
      points: s.points,
      outcome: s.outcome,
    })),
    tiebreaks: snap.tournament.tiebreaks,
  });
}

/** Translate a finished game row into a pairing result. */
export function resultFromGame(pairing: PairingRecord, game: GameStateRecord): PairingResult | null {
  if (game.status !== "finished" && game.status !== "aborted") return null;
  if (game.status === "aborted") return "void";
  if (game.winnerId && game.winnerId === pairing.whiteId) return "white";
  if (game.winnerId && game.winnerId === pairing.blackId) return "black";
  if (game.result === "white" || game.result === "1-0") return "white";
  if (game.result === "black" || game.result === "0-1") return "black";
  return "draw";
}

function roundsNeeded(format: TournamentFormat, playerCount: number, configured: number): number {
  if (format === "round_robin") {
    return playerCount % 2 === 0 ? Math.max(1, playerCount - 1) : playerCount;
  }
  if (format === "knockout") {
    let rounds = 0;
    let size = 1;
    while (size < Math.max(2, playerCount)) {
      size *= 2;
      rounds += 1;
    }
    return rounds;
  }
  return configured;
}

/**
 * Advance one tournament by one step. Safe to call as often as the cron fires:
 * every write is idempotent and the function recomputes state from the ledger.
 */
export async function tickTournament(
  store: TournamentStore,
  tournamentId: string,
  now: Date = new Date(),
): Promise<TickResult> {
  let snap = await store.loadSnapshot(tournamentId);
  if (!snap) return { status: "cancelled", actions: ["missing"], standings: [] };
  const actions: string[] = [];
  const t = snap.tournament;
  const scoring = resolveScoring(t.format, (t.scoring ?? {}) as never);

  if (t.status === "finished" || t.status === "cancelled" || t.paused) {
    return { status: t.status, actions: ["idle"], standings: standingsFor(snap) };
  }

  // --- lifecycle transitions ------------------------------------------------
  const startsAt = new Date(t.startsAt).getTime();
  const opensAt = t.registrationOpensAt
    ? new Date(t.registrationOpensAt).getTime()
    : startsAt - 30 * 60_000;

  if (t.status === "draft") {
    return { status: t.status, actions: ["draft"], standings: standingsFor(snap) };
  }
  if (t.status === "scheduled" && now.getTime() >= opensAt) {
    await store.setStatus(t.id, "registration");
    await store.logEvent(t.id, "registration_opened", {});
    t.status = "registration";
    actions.push("registration_opened");
  }
  if (t.status === "registration" && now.getTime() >= startsAt) {
    const active = snap.players.filter((p) => p.status === "active");
    if (active.length < 2) {
      await store.setStatus(t.id, "cancelled", { paused: false });
      await store.logEvent(t.id, "cancelled_no_players", { players: active.length });
      return { status: "cancelled", actions: [...actions, "cancelled_no_players"], standings: [] };
    }
    const endsAt =
      t.format === "arena"
        ? new Date(startsAt + t.durationMinutes * 60_000).toISOString()
        : t.endsAt;
    await store.setStatus(t.id, "running", { ends_at: endsAt });
    await store.logEvent(t.id, "started", { players: active.length });
    t.status = "running";
    t.endsAt = endsAt;
    actions.push("started");
  }
  if (t.status !== "running") {
    return { status: t.status, actions, standings: standingsFor(snap) };
  }

  // --- settle finished games ------------------------------------------------
  const openWithGames = snap.pairings.filter((p) => p.status === "active" && p.gameId);
  if (openWithGames.length > 0) {
    const games = await store.loadGames(openWithGames.map((p) => p.gameId!));
    const byId = new Map(games.map((g) => [g.id, g]));
    const preStandings = standingsFor(snap);
    const streaks = new Map(preStandings.map((s) => [s.userId, s.streak]));

    for (const pairing of [...openWithGames].sort(
      (a, b) => a.roundNumber - b.roundNumber || a.board - b.board,
    )) {
      const game = byId.get(pairing.gameId!);
      if (!game) continue;
      const result = resultFromGame(pairing, game);
      if (!result) continue;
      const sides = scorePairing(scoring, {
        result,
        whiteId: pairing.whiteId,
        blackId: pairing.blackId,
        whiteStreak: pairing.whiteId ? streaks.get(pairing.whiteId) ?? 0 : 0,
        blackStreak: pairing.blackId ? streaks.get(pairing.blackId) ?? 0 : 0,
      });
      await store.recordResult(
        pairing.id,
        result,
        sides.map((s) => ({
          user_id: s.userId,
          points: s.points,
          base_points: s.basePoints,
          bonus_points: s.bonusPoints,
          outcome: s.outcome,
          reason: "game_finished",
        })),
      );
      for (const s of sides) streaks.set(s.userId, s.streak);
      actions.push(`scored:${pairing.roundNumber}:${pairing.board}`);
    }
    snap = (await store.loadSnapshot(tournamentId)) ?? snap;
  }

  // --- start games for freshly paired boards --------------------------------
  for (const pairing of snap.pairings) {
    if (pairing.status === "pending" && pairing.whiteId && pairing.blackId && !pairing.gameId) {
      await store.startGame(pairing.id, STANDARD_START_FEN);
      actions.push(`game_started:${pairing.board}`);
    }
  }
  if (actions.some((a) => a.startsWith("game_started"))) {
    snap = (await store.loadSnapshot(tournamentId)) ?? snap;
  }

  // --- advance the schedule --------------------------------------------------
  let standings = standingsFor(snap);
  const activePlayers = snap.players.filter((p) => p.status === "active");
  const busy = new Set<string>();
  for (const p of snap.pairings) {
    if (p.status === "pending" || p.status === "active") {
      if (p.whiteId) busy.add(p.whiteId);
      if (p.blackId) busy.add(p.blackId);
    }
  }

  if (t.format === "arena") {
    const endsAt = t.endsAt ? new Date(t.endsAt).getTime() : startsAt + t.durationMinutes * 60_000;
    if (now.getTime() >= endsAt) {
      await store.setStatus(t.id, "finished");
      await store.logEvent(t.id, "finished", { reason: "duration_elapsed" });
      await store.setStandings(t.id, standings);
      return { status: "finished", actions: [...actions, "finished"], standings };
    }
    const free = toPairingPlayers(activePlayers, snap.pairings, standings).filter(
      (p) => !busy.has(p.userId),
    );
    if (free.length >= 2) {
      const slots = pairArena(free);
      if (slots.length > 0) {
        const nextRound = t.currentRound + 1;
        await store.openRound(t.id, nextRound);
        await store.applyPairings(t.id, nextRound, slots);
        actions.push(`arena_wave:${nextRound}:${slots.length}`);
        snap = (await store.loadSnapshot(tournamentId)) ?? snap;
        for (const pairing of snap.pairings) {
          if (pairing.roundNumber === nextRound && pairing.status === "pending" && !pairing.gameId) {
            await store.startGame(pairing.id, STANDARD_START_FEN);
          }
        }
      }
    }
  } else {
    const currentRound = t.currentRound;
    const currentPairings = snap.pairings.filter((p) => p.roundNumber === currentRound);
    const roundDone =
      currentRound === 0 ||
      (currentPairings.length > 0 &&
        currentPairings.every((p) => p.status === "finished" || p.status === "bye" || p.status === "void"));

    if (roundDone) {
      if (currentRound > 0) {
        const round = snap.rounds.find((r) => r.number === currentRound);
        if (round && round.status !== "finished") await store.finishRound(round.id);
      }
      const total = roundsNeeded(t.format, activePlayers.length, t.roundsTotal);
      const pool = toPairingPlayers(activePlayers, snap.pairings, standings);
      let slots: PairingSlot[] = [];
      let done = currentRound >= total;

      if (!done) {
        if (t.format === "swiss") {
          slots = pairSwiss(pool).slots;
        } else if (t.format === "round_robin") {
          slots = pairRoundRobin(pool, currentRound + 1);
        } else {
          if (currentRound === 0) {
            slots = pairKnockoutFirstRound(pool);
          } else {
            const survivors = new Set<string>();
            for (const p of currentPairings) {
              if (p.status === "void") continue;
              const winner = p.result === "black" ? p.blackId : p.whiteId;
              if (winner) survivors.add(winner);
            }
            if (survivors.size <= 1) {
              done = true;
            } else {
              slots = pairKnockoutNextRound(
                pool.filter((p) => survivors.has(p.userId)),
                currentPairings.map((p) => ({
                  board: p.board,
                  whiteId: p.whiteId,
                  blackId: p.blackId,
                  status: p.status,
                  result: p.result,
                  bracketSlot: p.bracketSlot,
                })),
              );
            }
          }
        }
      }

      if (!done && slots.length > 0) {
        const nextRound = currentRound + 1;
        await store.openRound(t.id, nextRound);
        await store.applyPairings(t.id, nextRound, slots);
        actions.push(`round_paired:${nextRound}`);
        snap = (await store.loadSnapshot(tournamentId)) ?? snap;
        standings = standingsFor(snap);
        const streaks = new Map(standings.map((s) => [s.userId, s.streak]));
        for (const pairing of snap.pairings.filter((p) => p.roundNumber === nextRound)) {
          if (pairing.status === "bye" && pairing.whiteId) {
            const sides = scorePairing(scoring, {
              result: "bye",
              whiteId: pairing.whiteId,
              blackId: null,
              whiteStreak: streaks.get(pairing.whiteId) ?? 0,
            });
            await store.recordResult(
              pairing.id,
              "bye",
              sides.map((s) => ({
                user_id: s.userId,
                points: s.points,
                base_points: s.basePoints,
                bonus_points: s.bonusPoints,
                outcome: s.outcome,
                reason: "bye",
              })),
            );
          } else if (pairing.status === "pending" && pairing.whiteId && pairing.blackId) {
            await store.startGame(pairing.id, STANDARD_START_FEN);
          }
        }
        snap = (await store.loadSnapshot(tournamentId)) ?? snap;
      } else if (done) {
        await store.setStatus(t.id, "finished");
        await store.logEvent(t.id, "finished", { rounds: currentRound });
        standings = standingsFor(snap);
        await store.setStandings(t.id, standings);
        return { status: "finished", actions: [...actions, "finished"], standings };
      }
    }
  }

  standings = standingsFor(snap);
  await store.setStandings(t.id, standings);
  return { status: "running", actions, standings };
}
