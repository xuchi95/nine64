/**
 * Endgame tablebase abstraction (server-only).
 *
 * Provider: the public Lichess Syzygy tablebase (open data, ≤7 pieces).
 * Rules mirrored from the opening explorer proxy:
 *  - the browser never calls the provider directly;
 *  - hard timeout on every call;
 *  - a failure counter opens a short circuit breaker;
 *  - when the service is unavailable we return `available: false` so the UI
 *    falls back to the local engine. We never invent a result.
 */

const BASE = "https://tablebase.lichess.ovh/standard";
const TIMEOUT_MS = 4_000;
const FAILURE_THRESHOLD = 4;
const BREAKER_OPEN_MS = 60_000;
/** Syzygy covers up to 7 men. */
export const MAX_TABLEBASE_PIECES = 7;

export type TablebaseOutcome = "win" | "draw" | "loss" | "cursed-win" | "blessed-loss";

export interface TablebaseMove {
  uci: string;
  san: string;
  outcome: TablebaseOutcome;
  dtz: number | null;
  dtm: number | null;
}

export interface TablebaseResult {
  available: boolean;
  /** Reason the lookup produced nothing (never a fabricated verdict). */
  reason: "ok" | "too_many_pieces" | "unavailable" | "not_found";
  outcome: TablebaseOutcome | null;
  dtz: number | null;
  dtm: number | null;
  /** Best moves for the side to move, sorted by the provider. */
  moves: TablebaseMove[];
  fetchedAt: string;
}

interface Breaker {
  failures: number;
  openedAt: number;
}
const breaker: Breaker = { failures: 0, openedAt: 0 };
const cache = new Map<string, { at: number; value: TablebaseResult }>();
const CACHE_TTL_MS = 10 * 60_000;

export function pieceCount(fen: string): number {
  const board = fen.split(" ")[0] ?? "";
  return board.replace(/[^a-zA-Z]/g, "").length;
}

function unavailable(reason: TablebaseResult["reason"]): TablebaseResult {
  return {
    available: false,
    reason,
    outcome: null,
    dtz: null,
    dtm: null,
    moves: [],
    fetchedAt: new Date().toISOString(),
  };
}

function categoryOf(raw: unknown): TablebaseOutcome | null {
  switch (String(raw)) {
    case "win":
      return "win";
    case "loss":
      return "loss";
    case "draw":
      return "draw";
    case "cursed-win":
      return "cursed-win";
    case "blessed-loss":
      return "blessed-loss";
    default:
      return null;
  }
}

export async function probeTablebase(fen: string): Promise<TablebaseResult> {
  if (pieceCount(fen) > MAX_TABLEBASE_PIECES) return unavailable("too_many_pieces");

  const cached = cache.get(fen);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  if (breaker.openedAt && Date.now() - breaker.openedAt < BREAKER_OPEN_MS) {
    return unavailable("unavailable");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE}?fen=${encodeURIComponent(fen)}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      if (response.status === 404) return unavailable("not_found");
      throw new Error(`tablebase_http_${response.status}`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const outcome = categoryOf(payload["category"]);
    if (!outcome) return unavailable("not_found");
    const moves: TablebaseMove[] = Array.isArray(payload["moves"])
      ? (payload["moves"] as Record<string, unknown>[]).slice(0, 8).map((m) => ({
          uci: String(m["uci"] ?? ""),
          san: String(m["san"] ?? ""),
          // The provider reports the child position from the opponent's view.
          outcome: categoryOf(m["category"]) ?? "draw",
          dtz: typeof m["dtz"] === "number" ? (m["dtz"] as number) : null,
          dtm: typeof m["dtm"] === "number" ? (m["dtm"] as number) : null,
        }))
      : [];
    const result: TablebaseResult = {
      available: true,
      reason: "ok",
      outcome,
      dtz: typeof payload["dtz"] === "number" ? (payload["dtz"] as number) : null,
      dtm: typeof payload["dtm"] === "number" ? (payload["dtm"] as number) : null,
      moves,
      fetchedAt: new Date().toISOString(),
    };
    breaker.failures = 0;
    breaker.openedAt = 0;
    cache.set(fen, { at: Date.now(), value: result });
    return result;
  } catch {
    breaker.failures += 1;
    if (breaker.failures >= FAILURE_THRESHOLD) {
      breaker.openedAt = Date.now();
      breaker.failures = 0;
    }
    return unavailable("unavailable");
  } finally {
    clearTimeout(timer);
  }
}
