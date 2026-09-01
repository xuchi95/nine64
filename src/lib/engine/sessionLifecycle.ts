/**
 * Pure lifecycle rules for Nine64 Titan bot sessions.
 *
 * Kept dependency-free so both the server module and the play UI share the
 * exact same semantics, and so the rules can be tested without a database.
 */

export type EndReason = "resign" | "abort" | "draw" | "startup_failed" | "timeout";

export interface EndPatch {
  status: "finished" | "aborted";
  result: string | null;
  endReason: string;
}

/**
 * Canonical terminal state for a session close. `result` is always written
 * from the player's colour, never from the client's claim.
 */
export function endSessionPatch(reason: EndReason, playerColor: "w" | "b"): EndPatch {
  switch (reason) {
    case "resign":
      return { status: "finished", result: playerColor === "w" ? "0-1" : "1-0", endReason: "resign" };
    case "timeout":
      return { status: "finished", result: playerColor === "w" ? "0-1" : "1-0", endReason: "timeout" };
    case "draw":
      return { status: "finished", result: "1/2-1/2", endReason: "agreement" };
    case "startup_failed":
      return { status: "aborted", result: null, endReason: "startup_failed" };
    default:
      return { status: "aborted", result: null, endReason: "abort" };
  }
}

export interface StartOutcome<S> {
  ok: boolean;
  code?: string | undefined;
  snapshot?: S | undefined;
}

/**
 * Creates a session and, when the engine has to open, guarantees that a
 * failure never leaves an active session behind: the freshly created row is
 * rolled back (best-effort) to `aborted / startup_failed`.
 */
export async function startWithRollback<S extends { sessionId: string }>(deps: {
  create: () => Promise<StartOutcome<S>>;
  /** Optional engine opening step (player is Black). */
  opening: ((snapshot: S) => Promise<StartOutcome<S>>) | null;
  abort: (sessionId: string) => Promise<void>;
}): Promise<{ ok: true; snapshot: S } | { ok: false; code: string }> {
  let created: S | null = null;
  try {
    const res = await deps.create();
    if (!res.ok || !res.snapshot) return { ok: false, code: res.code ?? "WRITE_FAILED" };
    created = res.snapshot;
    if (!deps.opening) return { ok: true, snapshot: created };

    const opened = await deps.opening(created);
    if (!opened.ok || !opened.snapshot) {
      await rollback(deps.abort, created.sessionId);
      return { ok: false, code: opened.code ?? "ENGINE_UNAVAILABLE" };
    }
    return { ok: true, snapshot: opened.snapshot };
  } catch {
    if (created) await rollback(deps.abort, created.sessionId);
    return { ok: false, code: "ENGINE_UNAVAILABLE" };
  }
}

async function rollback(abort: (id: string) => Promise<void>, sessionId: string): Promise<void> {
  try {
    await abort(sessionId);
  } catch {
    // Best-effort: the idle/zero-move sweeper is the safety net.
  }
}

export interface TitanSessionHandle {
  id: string;
  version: number;
}

/**
 * Client-side owner of the current Titan session handle. Every path that ends
 * a game (resign, draw, new setup, rematch) goes through `closeAndClear`, so a
 * session can never be silently orphaned by the UI.
 */
export function createTitanSessionController(deps: {
  end: (sessionId: string, reason: EndReason) => Promise<void>;
}) {
  let handle: TitanSessionHandle | null = null;
  return {
    get: () => handle,
    set(next: TitanSessionHandle | null) {
      handle = next;
    },
    /** Drops the handle without any server call (already terminal server-side). */
    clear() {
      handle = null;
    },
    /** Closes the current session server-side (best-effort) and clears it. */
    async closeAndClear(reason: EndReason): Promise<boolean> {
      const current = handle;
      handle = null;
      if (!current) return false;
      try {
        await deps.end(current.id, reason);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export type TitanSessionController = ReturnType<typeof createTitanSessionController>;
