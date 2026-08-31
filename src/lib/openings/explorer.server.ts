/**
 * Opening Explorer provider proxy.
 *
 * Rules enforced here:
 *  - the browser never calls the provider; only this server module does;
 *  - every response is cached in `opening_explorer_cache` (TTL per source);
 *  - each provider call has a hard timeout;
 *  - repeated failures trip a circuit breaker recorded in the database, so
 *    every worker isolate shares the same open/closed state;
 *  - outcomes feed `opening_explorer_health` for the admin cache metrics.
 *
 * Data source is the open Lichess database (ODbL). No proprietary third-party
 * database is copied or stored beyond the short-lived response cache.
 */
import {
  explorerCacheKey,
  scoreOf,
  type ExplorerFilters,
  type ExplorerMove,
  type ExplorerPosition,
} from "./explorerTypes";
import { ecoForPath } from "./eco.server";

const BASE = "https://explorer.lichess.ovh";
const TIMEOUT_MS = 6_000;
const FAILURE_THRESHOLD = 5;
const BREAKER_OPEN_SECONDS = 60;
const TTL_SECONDS: Record<string, number> = { masters: 86_400, lichess: 21_600 };

type Row = Record<string, unknown>;

interface ProviderMove {
  uci?: string;
  san?: string;
  white?: number;
  draws?: number;
  black?: number;
  averageRating?: number | null;
}

interface ProviderPayload {
  white?: number;
  draws?: number;
  black?: number;
  moves?: ProviderMove[];
  opening?: { eco?: string; name?: string } | null;
}

function providerUrl(fen: string, filters: ExplorerFilters): string {
  const params = new URLSearchParams({
    fen,
    moves: "14",
    topGames: "0",
    recentGames: "0",
  });
  params.set("since", String(filters.sinceYear));
  if (filters.source === "lichess") {
    params.set("variant", "standard");
    params.set("speeds", filters.speeds.join(","));
    params.set("ratings", filters.ratings.join(","));
  }
  return `${BASE}/${filters.source}?${params.toString()}`;
}

function toPosition(
  payload: ProviderPayload,
  fen: string,
  filters: ExplorerFilters,
  origin: ExplorerPosition["origin"],
  fetchedAt: string,
  sansSoFar: readonly string[],
): ExplorerPosition {
  const white = Number(payload.white ?? 0);
  const draws = Number(payload.draws ?? 0);
  const black = Number(payload.black ?? 0);
  const total = white + draws + black;
  const moves: ExplorerMove[] = (payload.moves ?? []).map((m) => {
    const w = Number(m.white ?? 0);
    const d = Number(m.draws ?? 0);
    const b = Number(m.black ?? 0);
    const games = w + d + b;
    const san = String(m.san ?? "");
    const eco = ecoForPath([...sansSoFar, san]);
    return {
      uci: String(m.uci ?? ""),
      san,
      games,
      white: w,
      draws: d,
      black: b,
      popularity: total > 0 ? games / total : 0,
      whiteScore: scoreOf(w, d, b),
      averageRating:
        typeof m.averageRating === "number" && Number.isFinite(m.averageRating)
          ? Math.round(m.averageRating)
          : null,
      eco: eco?.eco ?? null,
      openingName: eco?.name ?? null,
    };
  });
  const local = ecoForPath(sansSoFar);
  return {
    fen,
    source: filters.source,
    games: total,
    white,
    draws,
    black,
    eco: payload.opening?.eco ?? local?.eco ?? null,
    openingName: payload.opening?.name ?? local?.name ?? null,
    moves: moves.sort((a, b2) => b2.games - a.games),
    origin,
    fetchedAt,
    note: null,
  };
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function record(source: string, outcome: string, latencyMs: number, error?: string) {
  try {
    const db = await admin();
    await db.rpc("opening_explorer_record", {
      _source: source,
      _outcome: outcome,
      _latency_ms: Math.round(latencyMs),
      _error: error ?? null,
      _failure_threshold: FAILURE_THRESHOLD,
      _open_seconds: BREAKER_OPEN_SECONDS,
    } as never);
  } catch {
    /* metrics must never break a read */
  }
}

async function breakerOpen(source: string): Promise<boolean> {
  try {
    const db = await admin();
    const { data } = await db
      .from("opening_explorer_health")
      .select("open_until")
      .eq("source", source)
      .maybeSingle();
    const until = (data as Row | null)?.["open_until"];
    return typeof until === "string" && new Date(until).getTime() > Date.now();
  } catch {
    return false;
  }
}

/**
 * Reads a position through cache → provider. Never throws for provider
 * problems: it degrades to the stale cache entry, then to an empty result
 * flagged `unavailable`, so the Explorer UI stays usable.
 */
export async function readExplorer(
  fen: string,
  filters: ExplorerFilters,
  sansSoFar: readonly string[],
): Promise<ExplorerPosition> {
  const key = explorerCacheKey(fen, filters);
  const db = await admin();

  const { data: cached } = await db
    .from("opening_explorer_cache")
    .select("payload, fetched_at, expires_at, hits")
    .eq("cache_key", key)
    .maybeSingle();
  const row = cached as Row | null;
  const fresh = row && typeof row["expires_at"] === "string" && new Date(row["expires_at"] as string) > new Date();

  if (row && fresh) {
    void record(filters.source, "hit", 0);
    void db
      .from("opening_explorer_cache")
      .update({ hits: Number(row["hits"] ?? 0) + 1 })
      .eq("cache_key", key);
    return toPosition(
      row["payload"] as ProviderPayload,
      fen,
      filters,
      "cache",
      String(row["fetched_at"] ?? new Date().toISOString()),
      sansSoFar,
    );
  }

  const staleFallback = () => {
    if (!row) {
      const empty = toPosition({}, fen, filters, "unavailable", new Date().toISOString(), sansSoFar);
      return { ...empty, note: "provider_unavailable" };
    }
    const stale = toPosition(
      row["payload"] as ProviderPayload,
      fen,
      filters,
      "cache",
      String(row["fetched_at"] ?? new Date().toISOString()),
      sansSoFar,
    );
    return { ...stale, note: "stale_cache" };
  };

  if (await breakerOpen(filters.source)) {
    void record(filters.source, "breaker_open", 0);
    return { ...staleFallback(), note: "circuit_open" };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(providerUrl(fen, filters), {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "Nine64 Opening Lab" },
    });
    const latency = Date.now() - started;
    if (res.status === 429) {
      void record(filters.source, "rate_limited", latency, "provider 429");
      return { ...staleFallback(), note: "provider_rate_limited" };
    }
    if (!res.ok) {
      void record(filters.source, "error", latency, `HTTP ${res.status}`);
      return staleFallback();
    }
    const payload = (await res.json()) as ProviderPayload;
    const fetchedAt = new Date().toISOString();
    const ttl = TTL_SECONDS[filters.source] ?? 3_600;
    void record(filters.source, "miss", latency);
    void db.from("opening_explorer_cache").upsert(
      {
        cache_key: key,
        source: filters.source,
        fen,
        filters: filters as unknown as Row,
        payload: payload as unknown as Row,
        latency_ms: latency,
        fetched_at: fetchedAt,
        expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
      } as never,
      { onConflict: "cache_key" },
    );
    return toPosition(payload, fen, filters, "provider", fetchedAt, sansSoFar);
  } catch (err) {
    const latency = Date.now() - started;
    const aborted = err instanceof Error && err.name === "AbortError";
    void record(filters.source, aborted ? "timeout" : "error", latency, err instanceof Error ? err.message : "unknown");
    return { ...staleFallback(), note: aborted ? "provider_timeout" : "provider_error" };
  } finally {
    clearTimeout(timer);
  }
}
