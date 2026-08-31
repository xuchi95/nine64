/**
 * In-memory implementation of `TournamentStore`.
 *
 * It mirrors the semantics of the SQL RPCs (idempotent pairing application,
 * idempotent score ledger) so the engine can be driven end to end in tests
 * without a database.
 */

import type {
  GameStateRecord,
  PairingRecord,
  PlayerRecord,
  RoundRecord,
  ScoreRecord,
  ScoreWriteRow,
  TournamentRecord,
  TournamentSnapshot,
  TournamentStore,
} from "./engine";
import type { PairingResult, PairingSlot, StandingRow, TournamentStatus } from "./types";

export class MemoryTournamentStore implements TournamentStore {
  tournament: TournamentRecord;
  players: PlayerRecord[] = [];
  rounds: RoundRecord[] = [];
  pairings: PairingRecord[] = [];
  scores: ScoreRecord[] = [];
  games = new Map<string, GameStateRecord>();
  standings: StandingRow[] = [];
  events: { type: string; payload: Record<string, unknown> }[] = [];
  private counter = 0;

  constructor(tournament: TournamentRecord, players: PlayerRecord[]) {
    this.tournament = { ...tournament };
    this.players = players.map((p) => ({ ...p }));
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  async loadSnapshot(): Promise<TournamentSnapshot> {
    return {
      tournament: { ...this.tournament },
      players: this.players.map((p) => ({ ...p })),
      rounds: this.rounds.map((r) => ({ ...r })),
      pairings: this.pairings.map((p) => ({ ...p })),
      scores: this.scores.map((s) => ({ ...s })),
    };
  }

  async setStatus(_id: string, status: TournamentStatus, patch?: Record<string, unknown>) {
    this.tournament.status = status;
    if (patch && "ends_at" in patch) this.tournament.endsAt = (patch["ends_at"] as string) ?? null;
  }

  async openRound(_id: string, number: number) {
    const existing = this.rounds.find((r) => r.number === number);
    if (existing) return { roundId: existing.id, created: false };
    const round: RoundRecord = { id: this.nextId("round"), number, status: "running" };
    this.rounds.push(round);
    this.tournament.currentRound = Math.max(this.tournament.currentRound, number);
    return { roundId: round.id, created: true };
  }

  async applyPairings(_id: string, roundNumber: number, slots: PairingSlot[]) {
    for (const slot of slots) {
      const dup = this.pairings.find((p) => p.roundNumber === roundNumber && p.board === slot.board);
      if (dup) continue; // idempotent, mirrors the unique (round, board) key
      this.pairings.push({
        id: this.nextId("pairing"),
        roundNumber,
        board: slot.board,
        whiteId: slot.whiteId,
        blackId: slot.blackId,
        gameId: null,
        status: slot.status,
        result: slot.result,
        bracketSlot: slot.bracketSlot ?? null,
      });
    }
  }

  async startGame(pairingId: string) {
    const pairing = this.pairings.find((p) => p.id === pairingId);
    if (!pairing || pairing.gameId) return;
    const gameId = this.nextId("game");
    pairing.gameId = gameId;
    pairing.status = "active";
    this.games.set(gameId, { id: gameId, status: "active", result: null, winnerId: null });
  }

  async loadGames(ids: string[]) {
    return ids.map((id) => this.games.get(id)).filter((g): g is GameStateRecord => Boolean(g));
  }

  async recordResult(pairingId: string, result: PairingResult, rows: ScoreWriteRow[]) {
    const pairing = this.pairings.find((p) => p.id === pairingId);
    if (!pairing) return;
    // Idempotent, mirroring the ledger's unique (pairing, user) key.
    if (pairing.status === "void" || this.scores.some((s) => s.pairingId === pairingId)) return;
    pairing.result = result;
    pairing.status = result === "bye" ? "bye" : result === "void" ? "void" : "finished";
    for (const row of rows) {
      this.scores.push({
        pairingId,
        userId: row.user_id,
        points: row.points,
        outcome: row.outcome as ScoreRecord["outcome"],
      });
    }
  }

  async setStandings(_id: string, rows: StandingRow[]) {
    this.standings = rows;
  }

  async logEvent(_id: string, type: string, payload: Record<string, unknown>) {
    this.events.push({ type, payload });
  }

  async finishRound(roundId: string) {
    const round = this.rounds.find((r) => r.id === roundId);
    if (round) round.status = "finished";
  }

  // ---- test helpers --------------------------------------------------------

  /** Finish every running game; `winner` picks the side that wins. */
  finishOpenGames(pick: (pairing: PairingRecord) => "white" | "black" | "draw" | "abort") {
    for (const pairing of this.pairings) {
      if (pairing.status !== "active" || !pairing.gameId) continue;
      const game = this.games.get(pairing.gameId)!;
      if (game.status !== "active") continue;
      const decision = pick(pairing);
      if (decision === "abort") {
        game.status = "aborted";
        continue;
      }
      game.status = "finished";
      game.result = decision;
      game.winnerId =
        decision === "white" ? pairing.whiteId : decision === "black" ? pairing.blackId : null;
    }
  }
}
