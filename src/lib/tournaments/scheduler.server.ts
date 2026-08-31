/**
 * The tournament scheduler: the only place that drives the engine.
 *
 * A lease keeps one worker per tournament, so the cron endpoint and an admin
 * "run now" click can safely overlap.
 */

import { tickTournament } from "./engine";
import {
  createSupabaseTournamentStore,
  listSchedulableTournaments,
  withTournamentLease,
} from "./store.server";

export interface TickReport {
  tournamentId: string;
  status: string;
  actions: string[];
  skipped?: boolean;
  error?: string;
}

function owner(): string {
  return `nine64-scheduler-${Math.random().toString(36).slice(2, 8)}`;
}

export async function runTournamentTick(tournamentId: string): Promise<TickReport> {
  try {
    const result = await withTournamentLease(tournamentId, owner(), async () => {
      const store = createSupabaseTournamentStore();
      return tickTournament(store, tournamentId, new Date());
    });
    if (!result) return { tournamentId, status: "leased_elsewhere", actions: [], skipped: true };
    return { tournamentId, status: result.status, actions: result.actions };
  } catch (error) {
    return {
      tournamentId,
      status: "error",
      actions: [],
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}

export async function runScheduler(limit = 25): Promise<{ results: TickReport[] }> {
  const ids = await listSchedulableTournaments(limit);
  const results: TickReport[] = [];
  for (const id of ids) {
    results.push(await runTournamentTick(id));
  }
  return { results };
}
