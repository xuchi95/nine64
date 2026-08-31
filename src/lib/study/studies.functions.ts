/**
 * Study & Sharing server functions.
 *
 * Owner mutations run through `requireSupabaseAuth` (RLS scopes them to the
 * caller). The public read is unauthenticated by design and therefore
 * IP-rate-limited and slug-only: it can never return a private or revoked
 * study, and it never exposes a database id.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { contentSchema, assertContentSize, studyMetaSchema } from "./schema";
import { generateSlug, isValidSlug } from "./slug";
import type { ShareMode, StudyContent, StudySummary, StudyView, Visibility } from "./types";

type Row = Record<string, unknown>;

const slugInput = z.object({ slug: z.string().min(4).max(16).refine(isValidSlug, "BAD_SLUG") });

function summaryOf(row: Row): StudySummary {
  const chapters = ((row["content"] as { chapters?: unknown[] } | null)?.chapters ?? []) as unknown[];
  return {
    slug: String(row["slug"] ?? ""),
    title: String(row["title"] ?? ""),
    description: (row["description"] as string | null) ?? null,
    mode: (String(row["mode"] ?? "study") as ShareMode),
    visibility: (String(row["visibility"] ?? "private") as Visibility),
    revoked: row["revoked"] === true,
    chapterCount: chapters.length,
    createdAt: String(row["created_at"] ?? ""),
    updatedAt: String(row["updated_at"] ?? ""),
  };
}

/** Public read: `/s/$slug`, the embed and the social card all go through this. */
export const getPublicStudy = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => slugInput.parse(input))
  .handler(async ({ data }): Promise<StudyView | null> => {
    const { enforceRateLimit, ipSubject } = await import("@/lib/ratelimit/limiter.server");
    await enforceRateLimit("study.view", ipSubject());
    const { readStudyBySlug, bumpStudyView } = await import("./studies.server");
    const study = await readStudyBySlug(data.slug);
    if (study) void bumpStudyView(data.slug);
    return study;
  });

export const listMyStudies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudySummary[]> => {
    const { data, error } = await context.supabase
      .from("studies")
      .select("slug,title,description,mode,visibility,revoked,content,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => summaryOf(row as Row));
  });

const createInput = studyMetaSchema.extend({ content: contentSchema });

export const createStudy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createInput.parse(input))
  .handler(async ({ data, context }): Promise<{ slug: string }> => {
    const { enforceRateLimit, userSubject } = await import("@/lib/ratelimit/limiter.server");
    await enforceRateLimit("study.create", userSubject(context.userId));
    assertContentSize(data.content as StudyContent);

    const { derivedMeta } = await import("./studies.server");
    const meta = derivedMeta(data.content as StudyContent);

    // Retry on the (astronomically unlikely) slug collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = generateSlug();
      const { error } = await context.supabase.from("studies").insert({
        owner_id: context.userId,
        slug,
        title: data.title,
        description: data.description ?? null,
        mode: data.mode,
        visibility: data.visibility,
        engine_allowed: data.engineAllowed,
        content: data.content as unknown as never,
        preview_fen: meta.previewFen,
        white: meta.white,
        black: meta.black,
        result: meta.result,
      } as never);
      if (!error) return { slug };
      if (!error.message.includes("studies_slug_key")) throw new Error(error.message);
    }
    throw new Error("SLUG_ALLOCATION_FAILED");
  });

const updateInput = z.object({
  slug: z.string().refine(isValidSlug, "BAD_SLUG"),
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(600).nullable().optional(),
  mode: studyMetaSchema.shape.mode.optional(),
  visibility: studyMetaSchema.shape.visibility.optional(),
  engineAllowed: z.boolean().optional(),
  revoked: z.boolean().optional(),
  content: contentSchema.optional(),
});

export const updateStudy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const patch: Row = {};
    if (data.title !== undefined) patch["title"] = data.title;
    if (data.description !== undefined) patch["description"] = data.description;
    if (data.mode !== undefined) patch["mode"] = data.mode;
    if (data.visibility !== undefined) patch["visibility"] = data.visibility;
    if (data.engineAllowed !== undefined) patch["engine_allowed"] = data.engineAllowed;
    if (data.revoked !== undefined) patch["revoked"] = data.revoked;
    if (data.content !== undefined) {
      assertContentSize(data.content as StudyContent);
      const { derivedMeta } = await import("./studies.server");
      const meta = derivedMeta(data.content as StudyContent);
      patch["content"] = data.content;
      patch["preview_fen"] = meta.previewFen;
      patch["white"] = meta.white;
      patch["black"] = meta.black;
      patch["result"] = meta.result;
    }
    const { error } = await context.supabase
      .from("studies")
      .update(patch as never)
      .eq("slug", data.slug)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Revoking burns the old link: a new slug is issued so the old URL 404s. */
export const rotateStudySlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => slugInput.parse(input))
  .handler(async ({ data, context }): Promise<{ slug: string }> => {
    const next = generateSlug();
    const { error } = await context.supabase
      .from("studies")
      .update({ slug: next, revoked: false } as never)
      .eq("slug", data.slug)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { slug: next };
  });

export const deleteStudy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => slugInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("studies")
      .delete()
      .eq("slug", data.slug)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Owner read (works for private studies too, via RLS). */
export const getMyStudy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => slugInput.parse(input))
  .handler(async ({ data, context }): Promise<StudyView | null> => {
    const { data: row, error } = await context.supabase
      .from("studies")
      .select("*")
      .eq("slug", data.slug)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const { rowToStudyView } = await import("./studies.server");
    return rowToStudyView(row as Row);
  });

/** Parse a pasted PGN into chapters on the server (keeps the client lean). */
export const importStudyPgn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ pgn: z.string().min(2).max(600_000) }).parse(input))
  .handler(async ({ data }): Promise<StudyContent> => {
    const { parseStudyPgn } = await import("./pgn");
    const chapters = parseStudyPgn(data.pgn).slice(0, 32);
    if (chapters.length === 0) throw new Error("PGN_EMPTY");
    const content = { chapters } as StudyContent;
    assertContentSize(content);
    return content;
  });
