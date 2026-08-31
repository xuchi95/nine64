/**
 * Watch Center admin surface: events, broadcast sources, manual PGN ingest,
 * news CMS/moderation and ingestion health.
 *
 * Every function re-checks the admin role server-side; the sidebar only hides
 * links. Source tokens are stored hashed and are shown exactly once, at
 * creation time.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { IngestionJobRow, SourceHealth } from "./types";

type Row = Record<string, unknown>;

type RoleRpc = {
  rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" }) => PromiseLike<{ data: unknown }>;
};

async function assertWatchAdmin(context: { supabase: RoleRpc; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (data !== true) throw new Error("Forbidden");
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const nstr = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);

export async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ----------------------------- OVERVIEW ----------------------------- */

export const adminWatchOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertWatchAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [events, sources, jobs, news, newsSources] = await Promise.all([
      supabaseAdmin
        .from("events")
        .select("id, slug, name, status, starts_at, time_zone, is_published, featured, rounds_total")
        .order("starts_at", { ascending: false })
        .limit(60),
      supabaseAdmin
        .from("broadcast_sources")
        .select("*, events(slug, name)")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("ingestion_jobs").select("*").order("created_at", { ascending: false }).limit(40),
      supabaseAdmin
        .from("news_articles")
        .select("id, slug, title, source_name, status, published_at, external_url, language")
        .order("created_at", { ascending: false })
        .limit(60),
      supabaseAdmin.from("news_sources").select("*").order("name"),
    ]);

    return {
      events: ((events.data ?? []) as unknown as Row[]).map((e) => ({
        id: str(e["id"]),
        slug: str(e["slug"]),
        name: str(e["name"]),
        status: str(e["status"]),
        startsAt: str(e["starts_at"]),
        timeZone: str(e["time_zone"]),
        isPublished: e["is_published"] === true,
        featured: e["featured"] === true,
        roundsTotal: num(e["rounds_total"]),
      })),
      sources: ((sources.data ?? []) as unknown as Row[]).map((s): SourceHealth => {
        const ev = (s["events"] as Row | null) ?? {};
        return {
          id: str(s["id"]),
          name: str(s["name"]),
          kind: str(s["kind"]),
          status: (str(s["status"]) || "active") as SourceHealth["status"],
          url: nstr(s["url"]),
          eventSlug: nstr(ev["slug"]),
          eventName: nstr(ev["name"]),
          pollIntervalSeconds: num(s["poll_interval_seconds"], 30),
          lastSuccessAt: nstr(s["last_success_at"]),
          lastAttemptAt: nstr(s["last_attempt_at"]),
          lastError: nstr(s["last_error"]),
          consecutiveFailures: num(s["consecutive_failures"]),
          hasToken: Boolean(s["token_hash"]),
        };
      }),
      jobs: ((jobs.data ?? []) as unknown as Row[]).map(
        (j): IngestionJobRow => ({
          id: str(j["id"]),
          kind: (str(j["kind"]) || "broadcast") as IngestionJobRow["kind"],
          sourceId: nstr(j["source_id"]),
          sourceName: nstr(j["source_name"]),
          status: (str(j["status"]) || "ok") as IngestionJobRow["status"],
          itemsProcessed: num(j["items_processed"]),
          durationMs: typeof j["duration_ms"] === "number" ? (j["duration_ms"] as number) : null,
          error: nstr(j["error"]),
          createdAt: str(j["created_at"]),
        }),
      ),
      news: ((news.data ?? []) as unknown as Row[]).map((n) => ({
        id: str(n["id"]),
        slug: str(n["slug"]),
        title: str(n["title"]),
        sourceName: str(n["source_name"]),
        status: str(n["status"]),
        publishedAt: nstr(n["published_at"]),
        externalUrl: nstr(n["external_url"]),
        language: str(n["language"]),
      })),
      newsSources: ((newsSources.data ?? []) as unknown as Row[]).map((s) => ({
        id: str(s["id"]),
        slug: str(s["slug"]),
        name: str(s["name"]),
        feedUrl: nstr(s["feed_url"]),
        allowedHosts: Array.isArray(s["allowed_hosts"]) ? (s["allowed_hosts"] as string[]) : [],
        language: str(s["language"]),
        enabled: s["enabled"] === true,
        lastFetchedAt: nstr(s["last_fetched_at"]),
        lastError: nstr(s["last_error"]),
        consecutiveFailures: num(s["consecutive_failures"]),
      })),
    };
  });

/* ------------------------------ EVENTS ------------------------------ */

export const adminSaveEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        slug: z.string().min(1).max(120),
        name: z.string().min(1).max(200),
        description: z.string().max(4000).nullish(),
        location: z.string().max(200).nullish(),
        timeZone: z.string().min(1).max(64).default("UTC"),
        startsAt: z.string().min(4),
        endsAt: z.string().nullish(),
        status: z.enum(["upcoming", "live", "finished", "cancelled"]).default("upcoming"),
        tour: z.string().max(120).nullish(),
        officialUrl: z.string().url().max(500).nullish(),
        imageUrl: z.string().url().max(500).nullish(),
        roundsTotal: z.number().int().min(0).max(60).default(0),
        isPublished: z.boolean().default(false),
        featured: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertWatchAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      slug: data.slug,
      name: data.name,
      description: data.description ?? null,
      location: data.location ?? null,
      time_zone: data.timeZone,
      starts_at: new Date(data.startsAt).toISOString(),
      ends_at: data.endsAt ? new Date(data.endsAt).toISOString() : null,
      status: data.status,
      tour: data.tour ?? null,
      official_url: data.officialUrl ?? null,
      image_url: data.imageUrl ?? null,
      rounds_total: data.roundsTotal,
      is_published: data.isPublished,
      featured: data.featured,
    };
    const query = data.id
      ? supabaseAdmin.from("events").update(payload as never).eq("id", data.id)
      : supabaseAdmin.from("events").insert(payload as never);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertWatchAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------- BROADCAST SOURCES --------------------------- */

export const adminSaveBroadcastSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        eventId: z.string().uuid(),
        name: z.string().min(1).max(160),
        kind: z.enum(["pgn_push", "pgn_url", "manual"]).default("pgn_push"),
        url: z.string().url().max(500).nullish(),
        pollIntervalSeconds: z.number().int().min(10).max(3600).default(30),
        status: z.enum(["active", "paused", "error"]).default("active"),
        rotateToken: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertWatchAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // The plaintext token is returned once and never stored.
    let token: string | null = null;
    const payload: Row = {
      event_id: data.eventId,
      name: data.name,
      kind: data.kind,
      url: data.url ?? null,
      poll_interval_seconds: data.pollIntervalSeconds,
      status: data.status,
    };
    if (!data.id || data.rotateToken) {
      token = `n64_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().slice(0, 8)}`;
      payload["token_hash"] = await hashToken(token);
    }

    const query = data.id
      ? supabaseAdmin.from("broadcast_sources").update(payload as never).eq("id", data.id)
      : supabaseAdmin.from("broadcast_sources").insert(payload as never);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true, token };
  });

export const adminDeleteBroadcastSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertWatchAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("broadcast_sources").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Paste a PGN blob straight into an event (manual broadcast). */
export const adminIngestPgn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        eventId: z.string().uuid(),
        sourceId: z.string().uuid().nullish(),
        pgn: z.string().min(10).max(2_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertWatchAdmin(context);
    const { ingestPgn } = await import("./ingest.server");
    return ingestPgn({
      eventId: data.eventId,
      sourceId: data.sourceId ?? null,
      sourceName: "admin-manual",
      pgn: data.pgn,
    });
  });

/** Poll every due `pgn_url` source right now. */
export const adminPollBroadcasts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertWatchAdmin(context);
    const { pollBroadcastSources } = await import("./ingest.server");
    return pollBroadcastSources();
  });

/* ------------------------------- NEWS ------------------------------- */

export const adminSaveNewsSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        slug: z.string().min(1).max(80),
        name: z.string().min(1).max(160),
        kind: z.enum(["rss", "manual"]).default("rss"),
        feedUrl: z.string().url().max(500).nullish(),
        homepageUrl: z.string().url().max(500).nullish(),
        // Allowlist: only items linking to these hosts are imported.
        allowedHosts: z.array(z.string().min(1).max(160)).max(20).default([]),
        language: z.string().min(2).max(8).default("en"),
        enabled: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertWatchAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      slug: data.slug,
      name: data.name,
      kind: data.kind,
      feed_url: data.feedUrl ?? null,
      homepage_url: data.homepageUrl ?? null,
      allowed_hosts: data.allowedHosts.map((h) => h.trim().toLowerCase()).filter(Boolean),
      language: data.language,
      enabled: data.enabled,
    };
    const query = data.id
      ? supabaseAdmin.from("news_sources").update(payload as never).eq("id", data.id)
      : supabaseAdmin.from("news_sources").insert(payload as never);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRunNewsIngest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sourceId: z.string().uuid().optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertWatchAdmin(context);
    const { ingestNewsFeeds } = await import("./ingest.server");
    return data.sourceId ? ingestNewsFeeds({ sourceId: data.sourceId }) : ingestNewsFeeds();
  });

export const adminSetNewsStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), status: z.enum(["draft", "published", "rejected"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertWatchAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Row = { status: data.status };
    if (data.status === "published") patch["published_at"] = new Date().toISOString();
    const { error } = await supabaseAdmin.from("news_articles").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Editorial post authored inside Nine64 (no external source). */
export const adminSaveNewsArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        slug: z.string().min(1).max(160),
        title: z.string().min(1).max(300),
        summary: z.string().max(600).nullish(),
        contentHtml: z.string().max(60_000).nullish(),
        imageUrl: z.string().url().max(500).nullish(),
        externalUrl: z.string().url().max(500).nullish(),
        sourceName: z.string().min(1).max(120).default("Nine64"),
        language: z.enum(["vi", "en"]).default("vi"),
        tags: z.array(z.string().min(1).max(40)).max(10).default([]),
        eventId: z.string().uuid().nullish(),
        status: z.enum(["draft", "published", "rejected"]).default("draft"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertWatchAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sanitizeHtml, htmlToText } = await import("./sanitizeHtml");
    const html = sanitizeHtml(data.contentHtml ?? "");
    const payload: Row = {
      slug: data.slug,
      title: data.title,
      summary: data.summary ?? htmlToText(html, 320),
      content_html: html,
      image_url: data.imageUrl ?? null,
      external_url: data.externalUrl ?? null,
      source_name: data.sourceName,
      language: data.language,
      tags: data.tags,
      event_id: data.eventId ?? null,
      status: data.status,
    };
    if (data.status === "published") payload["published_at"] = new Date().toISOString();
    const query = data.id
      ? supabaseAdmin.from("news_articles").update(payload as never).eq("id", data.id)
      : supabaseAdmin.from("news_articles").insert(payload as never);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });
