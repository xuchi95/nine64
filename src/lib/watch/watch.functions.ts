/**
 * Public Watch Center reads.
 *
 * All of these are unauthenticated on purpose (public SEO pages, shareable
 * broadcast boards) and read through the publishable client, so RLS decides
 * what is visible. They are read-only: a spectator has no write path here.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  BroadcastGameDetail,
  BroadcastGameSummary,
  BroadcastMove,
  EventPlayer,
  EventRound,
  EventSummary,
  NewsArticleDetail,
  NewsCard,
} from "./types";

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const nstr = (v: unknown): string | null => (typeof v === "string" ? v : null);
const nnum = (v: unknown): number | null => (typeof v === "number" ? v : null);
const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);

function toEvent(row: Row): EventSummary {
  return {
    id: str(row["id"]),
    slug: str(row["slug"]),
    name: str(row["name"]),
    description: nstr(row["description"]),
    location: nstr(row["location"]),
    timeZone: str(row["time_zone"]) || "UTC",
    startsAt: str(row["starts_at"]),
    endsAt: nstr(row["ends_at"]),
    status: (str(row["status"]) || "upcoming") as EventSummary["status"],
    tour: nstr(row["tour"]),
    officialUrl: nstr(row["official_url"]),
    imageUrl: nstr(row["image_url"]),
    roundsTotal: num(row["rounds_total"]),
    featured: row["featured"] === true,
  };
}

function toGame(row: Row, event: { slug: string; name: string }, roundNumber: number | null): BroadcastGameSummary {
  return {
    id: str(row["id"]),
    eventId: str(row["event_id"]),
    eventSlug: event.slug,
    eventName: event.name,
    roundNumber,
    board: num(row["board"], 1),
    whiteName: str(row["white_name"]),
    blackName: str(row["black_name"]),
    whiteTitle: nstr(row["white_title"]),
    blackTitle: nstr(row["black_title"]),
    whiteRating: nnum(row["white_rating"]),
    blackRating: nnum(row["black_rating"]),
    status: (str(row["status"]) || "scheduled") as BroadcastGameSummary["status"],
    result: str(row["result"]) || "*",
    currentFen: str(row["current_fen"]),
    plyCount: num(row["ply_count"]),
    eco: nstr(row["eco"]),
    openingName: nstr(row["opening_name"]),
    whiteClockMs: nnum(row["white_clock_ms"]),
    blackClockMs: nnum(row["black_clock_ms"]),
    evalCp: nnum(row["eval_cp"]),
    evalMate: nnum(row["eval_mate"]),
    lastMoveAt: nstr(row["last_move_at"]),
  };
}

function toNewsCard(row: Row): NewsCard {
  return {
    id: str(row["id"]),
    slug: str(row["slug"]),
    title: str(row["title"]),
    summary: nstr(row["summary"]),
    imageUrl: nstr(row["image_url"]),
    externalUrl: nstr(row["external_url"]),
    sourceName: str(row["source_name"]) || "Nine64",
    author: nstr(row["author"]),
    language: str(row["language"]) || "vi",
    tags: Array.isArray(row["tags"]) ? (row["tags"] as string[]) : [],
    publishedAt: str(row["published_at"]),
  };
}

/** Live (and recently finished) broadcast boards across every published event. */
export const listLiveBroadcasts = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ limit: z.number().int().min(1).max(60).default(24) }).parse(input ?? {}))
  .handler(async ({ data }): Promise<BroadcastGameSummary[]> => {
    const { createPublicSupabase } = await import("./publicClient.server");
    const db = createPublicSupabase();
    const { data: rows } = await db
      .from("event_games")
      .select(
        "id, event_id, board, white_name, black_name, white_title, black_title, white_rating, black_rating, status, result, current_fen, ply_count, eco, opening_name, white_clock_ms, black_clock_ms, eval_cp, eval_mate, last_move_at, events(slug, name), event_rounds(number)",
      )
      .in("status", ["live", "finished"])
      .order("status", { ascending: true })
      .order("last_move_at", { ascending: false })
      .limit(data.limit);

    return ((rows ?? []) as unknown as Row[]).map((row) => {
      const ev = (row["events"] as Row | null) ?? {};
      const rd = (row["event_rounds"] as Row | null) ?? {};
      return toGame(row, { slug: str(ev["slug"]), name: str(ev["name"]) }, nnum(rd["number"]));
    });
  });

/** Event calendar. `scope` filters upcoming vs finished. */
export const listEvents = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        scope: z.enum(["all", "live", "upcoming", "past"]).default("all"),
        limit: z.number().int().min(1).max(100).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<EventSummary[]> => {
    const { createPublicSupabase } = await import("./publicClient.server");
    const db = createPublicSupabase();
    let query = db.from("events").select("*").limit(data.limit);
    if (data.scope === "live") query = query.eq("status", "live");
    if (data.scope === "upcoming") query = query.eq("status", "upcoming");
    if (data.scope === "past") query = query.in("status", ["finished", "cancelled"]);
    query = query.order("starts_at", { ascending: data.scope !== "past" });
    const { data: rows } = await query;
    return ((rows ?? []) as unknown as Row[]).map(toEvent);
  });

export interface EventDetail {
  event: EventSummary;
  rounds: EventRound[];
  players: EventPlayer[];
  games: BroadcastGameSummary[];
}

export const getEvent = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data }): Promise<EventDetail | null> => {
    const { createPublicSupabase } = await import("./publicClient.server");
    const db = createPublicSupabase();
    const { data: eventRow } = await db.from("events").select("*").eq("slug", data.slug).maybeSingle();
    if (!eventRow) return null;
    const event = toEvent(eventRow as unknown as Row);

    const [{ data: rounds }, { data: players }, { data: games }] = await Promise.all([
      db.from("event_rounds").select("*").eq("event_id", event.id).order("number"),
      db.from("event_players").select("*").eq("event_id", event.id).order("rating", { ascending: false }),
      db
        .from("event_games")
        .select("*, event_rounds(number)")
        .eq("event_id", event.id)
        .order("board", { ascending: true }),
    ]);

    return {
      event,
      rounds: ((rounds ?? []) as unknown as Row[]).map((r) => ({
        id: str(r["id"]),
        number: num(r["number"]),
        name: nstr(r["name"]),
        startsAt: nstr(r["starts_at"]),
        status: (str(r["status"]) || "scheduled") as EventRound["status"],
      })),
      players: ((players ?? []) as unknown as Row[]).map((p) => ({
        id: str(p["id"]),
        slug: str(p["slug"]),
        name: str(p["name"]),
        title: nstr(p["title"]),
        federation: nstr(p["federation"]),
        rating: nnum(p["rating"]),
        fideId: nstr(p["fide_id"]),
        avatarUrl: nstr(p["avatar_url"]),
        bio: nstr(p["bio"]),
      })),
      games: ((games ?? []) as unknown as Row[]).map((g) =>
        toGame(g, { slug: event.slug, name: event.name }, nnum(((g["event_rounds"] as Row | null) ?? {})["number"])),
      ),
    };
  });

/** Full broadcast board state, including the canonical move list. */
export const getBroadcastGame = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ gameId: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<BroadcastGameDetail | null> => {
    const { createPublicSupabase } = await import("./publicClient.server");
    const db = createPublicSupabase();
    const { data: row } = await db
      .from("event_games")
      .select("*, events(slug, name, time_zone), event_rounds(number)")
      .eq("id", data.gameId)
      .maybeSingle();
    if (!row) return null;
    const r = row as unknown as Row;
    const ev = (r["events"] as Row | null) ?? {};
    const summary = toGame(
      r,
      { slug: str(ev["slug"]), name: str(ev["name"]) },
      nnum(((r["event_rounds"] as Row | null) ?? {})["number"]),
    );
    return {
      ...summary,
      startFen: nstr(r["start_fen"]),
      moves: Array.isArray(r["moves"]) ? (r["moves"] as BroadcastMove[]) : [],
      pgn: nstr(r["pgn"]),
      termination: nstr(r["termination"]),
      startedAt: nstr(r["started_at"]),
      timeZone: str(ev["time_zone"]) || "UTC",
    };
  });

/** Published news cards, newest first. */
export const listNews = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        limit: z.number().int().min(1).max(60).default(24),
        tag: z.string().max(60).optional(),
        source: z.string().max(120).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<{ items: NewsCard[]; sources: string[] }> => {
    const { createPublicSupabase } = await import("./publicClient.server");
    const db = createPublicSupabase();
    let query = db
      .from("news_articles")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(data.limit);
    if (data.tag) query = query.contains("tags", [data.tag]);
    if (data.source) query = query.eq("source_name", data.source);
    const [{ data: rows }, { data: sources }] = await Promise.all([
      query,
      db.from("news_sources").select("name").order("name"),
    ]);
    return {
      items: ((rows ?? []) as unknown as Row[]).map(toNewsCard),
      sources: ((sources ?? []) as unknown as Row[]).map((s) => str(s["name"])).filter(Boolean),
    };
  });

export const getNewsArticle = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(160) }).parse(input))
  .handler(async ({ data }): Promise<NewsArticleDetail | null> => {
    const { createPublicSupabase } = await import("./publicClient.server");
    const { sanitizeHtml } = await import("./sanitizeHtml");
    const db = createPublicSupabase();
    const { data: row } = await db
      .from("news_articles")
      .select("*, news_sources(homepage_url), events(slug, name)")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!row) return null;
    const r = row as unknown as Row;
    const source = (r["news_sources"] as Row | null) ?? {};
    const event = (r["events"] as Row | null) ?? {};
    return {
      ...toNewsCard(r),
      // Defence in depth: sanitize again on the way out.
      contentHtml: sanitizeHtml(nstr(r["content_html"])),
      sourceHomepage: nstr(source["homepage_url"]),
      eventSlug: nstr(event["slug"]),
      eventName: nstr(event["name"]),
    };
  });

export interface PlayerProfile {
  slug: string;
  name: string;
  title: string | null;
  federation: string | null;
  rating: number | null;
  fideId: string | null;
  avatarUrl: string | null;
  bio: string | null;
  events: { slug: string; name: string; startsAt: string; status: string }[];
  games: BroadcastGameSummary[];
}

/** Cross-event player page (SEO). Aggregates every event entry for a slug. */
export const getPlayerProfile = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data }): Promise<PlayerProfile | null> => {
    const { createPublicSupabase } = await import("./publicClient.server");
    const db = createPublicSupabase();
    const { data: rows } = await db
      .from("event_players")
      .select("*, events(slug, name, starts_at, status)")
      .eq("slug", data.slug);
    const entries = (rows ?? []) as unknown as Row[];
    if (entries.length === 0) return null;

    const primary = entries.reduce((best, cur) =>
      num(cur["rating"]) > num(best["rating"]) ? cur : best,
    );
    const ids = entries.map((e) => str(e["id"]));
    const { data: gameRows } = await db
      .from("event_games")
      .select("*, events(slug, name), event_rounds(number)")
      .or(`white_player_id.in.(${ids.join(",")}),black_player_id.in.(${ids.join(",")})`)
      .order("last_move_at", { ascending: false })
      .limit(30);

    return {
      slug: data.slug,
      name: str(primary["name"]),
      title: nstr(primary["title"]),
      federation: nstr(primary["federation"]),
      rating: nnum(primary["rating"]),
      fideId: nstr(primary["fide_id"]),
      avatarUrl: nstr(primary["avatar_url"]),
      bio: nstr(primary["bio"]),
      events: entries
        .map((e) => (e["events"] as Row | null) ?? {})
        .filter((e) => str(e["slug"]))
        .map((e) => ({
          slug: str(e["slug"]),
          name: str(e["name"]),
          startsAt: str(e["starts_at"]),
          status: str(e["status"]),
        })),
      games: ((gameRows ?? []) as unknown as Row[]).map((g) => {
        const ev = (g["events"] as Row | null) ?? {};
        return toGame(
          g,
          { slug: str(ev["slug"]), name: str(ev["name"]) },
          nnum(((g["event_rounds"] as Row | null) ?? {})["number"]),
        );
      }),
    };
  });
