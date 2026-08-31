/**
 * Broadcast + news ingestion.
 *
 * Server-only. Every write here is idempotent on a natural key
 * (`event_id + external_id` for games, `external_guid` for articles) so a feed
 * that replays the same PGN or RSS item converges instead of duplicating.
 *
 * Spectators never reach this module: the canonical broadcast state is written
 * exclusively by admin actions, the push endpoint and the polling tick.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { externalIdFor, parsePgnGame, splitPgnGames, type ParsedPgnGame } from "./pgn.server";
import { htmlToText, isHostAllowed, sanitizeHtml } from "./sanitizeHtml";
import { parseFeed } from "./rss";

type Row = Record<string, unknown>;

export interface IngestReport {
  ok: boolean;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

function emptyReport(): IngestReport {
  return { ok: true, processed: 0, created: 0, updated: 0, skipped: 0, errors: [] };
}

export function slugify(input: string, fallback = "item"): string {
  const base = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || fallback;
}

async function logJob(entry: {
  kind: "broadcast" | "news";
  sourceId?: string | null;
  sourceName?: string | null;
  status: "ok" | "failed";
  itemsProcessed?: number;
  durationMs?: number;
  error?: string | null;
  detail?: unknown;
}) {
  await supabaseAdmin.from("ingestion_jobs").insert({
    kind: entry.kind,
    source_id: entry.sourceId ?? null,
    source_name: entry.sourceName ?? null,
    status: entry.status,
    items_processed: entry.itemsProcessed ?? 0,
    duration_ms: entry.durationMs ?? null,
    error: entry.error ?? null,
    detail: (entry.detail as never) ?? null,
  });
}

async function markSource(sourceId: string, ok: boolean, error?: string) {
  const patch: Row = { last_attempt_at: new Date().toISOString() };
  if (ok) {
    patch["last_success_at"] = new Date().toISOString();
    patch["last_error"] = null;
    patch["consecutive_failures"] = 0;
    patch["status"] = "active";
  } else {
    patch["last_error"] = error?.slice(0, 500) ?? "unknown";
    const { data } = await supabaseAdmin
      .from("broadcast_sources")
      .select("consecutive_failures")
      .eq("id", sourceId)
      .maybeSingle();
    const fails = ((data as Row | null)?.["consecutive_failures"] as number | undefined) ?? 0;
    patch["consecutive_failures"] = fails + 1;
    if (fails + 1 >= 3) patch["status"] = "error";
  }
  await supabaseAdmin.from("broadcast_sources").update(patch as never).eq("id", sourceId);
}

function roundNumberOf(game: ParsedPgnGame): number | null {
  const raw = game.headers["Round"];
  if (!raw) return null;
  const n = Number.parseInt(raw.split(".")[0] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function ensureRound(eventId: string, number: number): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("event_rounds")
    .select("id")
    .eq("event_id", eventId)
    .eq("number", number)
    .maybeSingle();
  if (data) return (data as Row)["id"] as string;
  const { data: created } = await supabaseAdmin
    .from("event_rounds")
    .insert({ event_id: eventId, number, name: null } as never)
    .select("id")
    .maybeSingle();
  return created ? ((created as Row)["id"] as string) : null;
}

async function ensurePlayer(
  eventId: string,
  name: string,
  title: string | null,
  rating: number | null,
): Promise<string | null> {
  const clean = name.trim();
  if (!clean || clean === "?") return null;
  const slug = slugify(clean, "player");
  const { data } = await supabaseAdmin
    .from("event_players")
    .select("id")
    .eq("event_id", eventId)
    .eq("slug", slug)
    .maybeSingle();
  if (data) return (data as Row)["id"] as string;
  const { data: created } = await supabaseAdmin
    .from("event_players")
    .insert({ event_id: eventId, slug, name: clean, title, rating } as never)
    .select("id")
    .maybeSingle();
  return created ? ((created as Row)["id"] as string) : null;
}

function ratingOf(headers: Record<string, string>, key: string): number | null {
  const n = Number.parseInt(headers[key] ?? "", 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Apply a PGN blob to an event.
 *
 * A game only moves forward: an update that carries fewer plies than the row
 * already has is ignored, so an out-of-order or truncated push can never roll
 * the canonical broadcast back.
 */
export async function ingestPgn(input: {
  eventId: string;
  sourceId?: string | null;
  sourceName?: string | null;
  pgn: string;
}): Promise<IngestReport> {
  const started = Date.now();
  const report = emptyReport();
  const texts = splitPgnGames(input.pgn);
  if (texts.length === 0) {
    report.ok = false;
    report.errors.push("EMPTY_PGN");
  }

  for (const [index, text] of texts.entries()) {
    try {
      const game = parsePgnGame(text);
      const externalId = game.headers["GameId"] ?? externalIdFor(game, index);
      const roundNumber = roundNumberOf(game);
      const roundId = roundNumber ? await ensureRound(input.eventId, roundNumber) : null;
      const whiteName = game.headers["White"] ?? "White";
      const blackName = game.headers["Black"] ?? "Black";
      const whiteTitle = game.headers["WhiteTitle"] ?? null;
      const blackTitle = game.headers["BlackTitle"] ?? null;
      const whiteRating = ratingOf(game.headers, "WhiteElo");
      const blackRating = ratingOf(game.headers, "BlackElo");

      const { data: existing } = await supabaseAdmin
        .from("event_games")
        .select("id, ply_count, status")
        .eq("event_id", input.eventId)
        .eq("external_id", externalId)
        .maybeSingle();
      const prior = existing as Row | null;

      if (prior && (prior["ply_count"] as number) > game.moves.length && game.result === "*") {
        report.skipped += 1;
        continue;
      }

      const boardRaw = Number.parseInt(game.headers["Board"] ?? "", 10);
      const status = game.result !== "*" ? "finished" : game.moves.length > 0 ? "live" : "scheduled";
      const payload: Row = {
        event_id: input.eventId,
        round_id: roundId,
        source_id: input.sourceId ?? null,
        external_id: externalId,
        board: Number.isFinite(boardRaw) && boardRaw > 0 ? boardRaw : (index + 1),
        white_name: whiteName,
        black_name: blackName,
        white_title: whiteTitle,
        black_title: blackTitle,
        white_rating: whiteRating,
        black_rating: blackRating,
        white_player_id: await ensurePlayer(input.eventId, whiteName, whiteTitle, whiteRating),
        black_player_id: await ensurePlayer(input.eventId, blackName, blackTitle, blackRating),
        status,
        result: game.result,
        termination: game.headers["Termination"] ?? null,
        start_fen: game.startFen,
        current_fen: game.currentFen,
        ply_count: game.moves.length,
        moves: game.moves as never,
        pgn: game.pgn,
        eco: game.eco,
        opening_name: game.openingName,
        white_clock_ms: game.whiteClockMs,
        black_clock_ms: game.blackClockMs,
        eval_cp: game.evalCp,
        eval_mate: game.evalMate,
        last_move_at: new Date().toISOString(),
      };

      if (prior) {
        const { error } = await supabaseAdmin
          .from("event_games")
          .update(payload as never)
          .eq("id", prior["id"] as string);
        if (error) throw new Error(error.message);
        report.updated += 1;
      } else {
        payload["started_at"] = new Date().toISOString();
        const { error } = await supabaseAdmin.from("event_games").insert(payload as never);
        if (error) throw new Error(error.message);
        report.created += 1;
      }
      report.processed += 1;
    } catch (e) {
      report.ok = false;
      report.errors.push(e instanceof Error ? e.message : "UNKNOWN");
    }
  }

  if (input.sourceId) await markSource(input.sourceId, report.ok, report.errors[0]);
  await logJob({
    kind: "broadcast",
    sourceId: input.sourceId ?? null,
    sourceName: input.sourceName ?? null,
    status: report.ok ? "ok" : "failed",
    itemsProcessed: report.processed,
    durationMs: Date.now() - started,
    error: report.errors[0] ?? null,
    detail: { created: report.created, updated: report.updated, skipped: report.skipped },
  });

  // Bubble live status up to the event itself.
  if (report.processed > 0) {
    await supabaseAdmin
      .from("events")
      .update({ status: "live" } as never)
      .eq("id", input.eventId)
      .eq("status", "upcoming");
  }
  return report;
}

/** Poll every `pgn_url` source that is due, and apply what it returns. */
export async function pollBroadcastSources(): Promise<{ sources: number; games: number }> {
  const { data } = await supabaseAdmin
    .from("broadcast_sources")
    .select("id, name, url, event_id, poll_interval_seconds, last_attempt_at, status, kind")
    .eq("kind", "pgn_url")
    .neq("status", "paused");

  const rows = (data ?? []) as Row[];
  let games = 0;
  let used = 0;
  for (const row of rows) {
    const url = row["url"] as string | null;
    const eventId = row["event_id"] as string | null;
    if (!url || !eventId) continue;
    const interval = ((row["poll_interval_seconds"] as number) || 30) * 1000;
    const last = row["last_attempt_at"] ? Date.parse(row["last_attempt_at"] as string) : 0;
    if (Date.now() - last < interval) continue;
    used += 1;
    try {
      const res = await fetch(url, { headers: { accept: "application/x-chess-pgn, text/plain" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pgn = await res.text();
      const report = await ingestPgn({
        eventId,
        sourceId: row["id"] as string,
        sourceName: row["name"] as string,
        pgn,
      });
      games += report.processed;
    } catch (e) {
      const message = e instanceof Error ? e.message : "UNKNOWN";
      await markSource(row["id"] as string, false, message);
      await logJob({
        kind: "broadcast",
        sourceId: row["id"] as string,
        sourceName: row["name"] as string,
        status: "failed",
        error: message,
      });
    }
  }
  return { sources: used, games };
}

/* ------------------------------ NEWS ------------------------------ */

export interface NewsIngestReport extends IngestReport {
  sources: number;
}

/**
 * Fetch every enabled RSS source and store new items as draft articles.
 *
 * Items whose link is outside the source's host allowlist are rejected, and
 * all imported HTML goes through the sanitizer before it is stored — the
 * rendering layer never sees raw third-party markup.
 */
export async function ingestNewsFeeds(options?: { sourceId?: string }): Promise<NewsIngestReport> {
  const base = supabaseAdmin
    .from("news_sources")
    .select("id, slug, name, feed_url, homepage_url, allowed_hosts, language, enabled, kind")
    .eq("kind", "rss")
    .eq("enabled", true);
  const { data } = options?.sourceId ? await base.eq("id", options.sourceId) : await base;

  const report: NewsIngestReport = { ...emptyReport(), sources: 0 };
  for (const row of (data ?? []) as Row[]) {
    const started = Date.now();
    const sourceId = row["id"] as string;
    const sourceName = row["name"] as string;
    const feedUrl = row["feed_url"] as string | null;
    const allowed = ((row["allowed_hosts"] as string[] | null) ?? []).slice();
    if (!feedUrl) continue;
    report.sources += 1;

    try {
      if (!isHostAllowed(feedUrl, allowed)) throw new Error("FEED_HOST_NOT_ALLOWED");
      const res = await fetch(feedUrl, { headers: { accept: "application/rss+xml, application/xml, text/xml" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const items = parseFeed(xml);
      let stored = 0;

      for (const item of items) {
        if (!item.link || !isHostAllowed(item.link, allowed)) {
          report.skipped += 1;
          continue;
        }
        const guid = `${row["slug"] as string}:${item.guid}`.slice(0, 300);
        const { data: existing } = await supabaseAdmin
          .from("news_articles")
          .select("id")
          .eq("external_guid", guid)
          .maybeSingle();
        if (existing) {
          report.skipped += 1;
          continue;
        }
        const publishedAt = item.publishedAt ?? new Date().toISOString();
        const slug = `${slugify(item.title, "tin")}-${guid.length.toString(36)}${Date.parse(publishedAt).toString(36).slice(-4)}`;
        const image = item.imageUrl && isHostAllowed(item.imageUrl, allowed) ? item.imageUrl : item.imageUrl;
        const { error } = await supabaseAdmin.from("news_articles").insert({
          slug,
          source_id: sourceId,
          source_name: sourceName,
          title: item.title.slice(0, 300),
          summary: htmlToText(item.summaryHtml, 320),
          content_html: sanitizeHtml(item.summaryHtml),
          image_url: image,
          external_url: item.link,
          author: item.author,
          language: (row["language"] as string) ?? "en",
          status: "draft",
          published_at: publishedAt,
          external_guid: guid,
        } as never);
        if (error) throw new Error(error.message);
        stored += 1;
        report.created += 1;
      }

      report.processed += stored;
      await supabaseAdmin
        .from("news_sources")
        .update({
          last_fetched_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
          last_error: null,
          consecutive_failures: 0,
        } as never)
        .eq("id", sourceId);
      await logJob({
        kind: "news",
        sourceId,
        sourceName,
        status: "ok",
        itemsProcessed: stored,
        durationMs: Date.now() - started,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "UNKNOWN";
      report.ok = false;
      report.errors.push(`${sourceName}: ${message}`);
      const { data: cur } = await supabaseAdmin
        .from("news_sources")
        .select("consecutive_failures")
        .eq("id", sourceId)
        .maybeSingle();
      await supabaseAdmin
        .from("news_sources")
        .update({
          last_fetched_at: new Date().toISOString(),
          last_error: message.slice(0, 500),
          consecutive_failures: (((cur as Row | null)?.["consecutive_failures"] as number) ?? 0) + 1,
        } as never)
        .eq("id", sourceId);
      await logJob({
        kind: "news",
        sourceId,
        sourceName,
        status: "failed",
        error: message,
        durationMs: Date.now() - started,
      });
    }
  }
  return report;
}
