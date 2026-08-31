/**
 * Academy CMS (admin).
 *
 * Draft → publish → version history, mirroring the system-settings pattern:
 * editors always mutate `draft`; publishing copies the draft into `published`,
 * bumps `version` and appends an immutable row to `learn_content_versions`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CourseDocSchema, LessonDocSchema } from "./lessonTypes";
import type { CourseRecord, LessonRecord } from "./lessonTypes";

type Row = Record<string, unknown>;

type RoleRpc = {
  rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" }) => PromiseLike<{ data: unknown }>;
};

async function assertLearnAdmin(context: { supabase: RoleRpc; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (data !== true) throw new Error("Forbidden");
}

const SLUG = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug_format");

export interface AdminCourse extends CourseRecord {
  draftDirty: boolean;
  lessons: AdminLesson[];
}
export interface AdminLesson extends LessonRecord {
  draftDirty: boolean;
  learners: number;
  completions: number;
  avgMastery: number;
}

/** Full CMS tree with drafts + per-lesson analytics. */
export const adminLearnOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ courses: AdminCourse[] }> => {
    await assertLearnAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { mapCourse, mapLesson } = await import("./content.server");

    const [{ data: courseRows }, { data: lessonRows }, { data: progressRows }] = await Promise.all([
      supabaseAdmin.from("learn_courses").select("*").order("kind").order("sort_order"),
      supabaseAdmin.from("learn_lessons").select("*").order("sort_order"),
      supabaseAdmin.from("learn_progress").select("lesson_id, status, mastery"),
    ]);

    const stats = new Map<string, { learners: number; completions: number; mastery: number }>();
    for (const row of (progressRows ?? []) as Row[]) {
      const id = String(row["lesson_id"]);
      const entry = stats.get(id) ?? { learners: 0, completions: 0, mastery: 0 };
      entry.learners += 1;
      if (row["status"] === "completed") entry.completions += 1;
      entry.mastery += Number(row["mastery"] ?? 0);
      stats.set(id, entry);
    }

    const lessonsByCourse = new Map<string, AdminLesson[]>();
    for (const row of (lessonRows ?? []) as Row[]) {
      const base = mapLesson(row, true);
      const stat = stats.get(base.id);
      const lesson: AdminLesson = {
        ...base,
        draftDirty: JSON.stringify(row["draft"] ?? {}) !== JSON.stringify(row["published"] ?? {}),
        learners: stat?.learners ?? 0,
        completions: stat?.completions ?? 0,
        avgMastery: stat && stat.learners > 0 ? Math.round(stat.mastery / stat.learners) : 0,
      };
      const list = lessonsByCourse.get(lesson.courseId) ?? [];
      list.push(lesson);
      lessonsByCourse.set(lesson.courseId, list);
    }

    const courses: AdminCourse[] = ((courseRows ?? []) as Row[]).map((row) => ({
      ...mapCourse(row, true),
      draftDirty: JSON.stringify(row["draft"] ?? {}) !== JSON.stringify(row["published"] ?? {}),
      lessons: (lessonsByCourse.get(String(row["id"])) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    }));
    return { courses };
  });

export const createCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { slug: string; kind: "course" | "endgame"; track?: string; titleVi: string; titleEn: string }) =>
    z
      .object({
        slug: SLUG,
        kind: z.enum(["course", "endgame"]),
        track: z.string().max(60).optional(),
        titleVi: z.string().min(1).max(160),
        titleEn: z.string().min(1).max(160),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertLearnAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const doc = CourseDocSchema.parse({
      title: { vi: data.titleVi, en: data.titleEn },
      chapters: [{ id: "main", title: { vi: "Nội dung", en: "Content" } }],
    });
    const { error } = await supabaseAdmin.from("learn_courses").insert({
      slug: data.slug,
      kind: data.kind,
      track: data.track ?? null,
      draft: doc,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { courseId: string; slug: string; chapterId?: string; titleVi: string; titleEn: string }) =>
    z
      .object({
        courseId: z.string().uuid(),
        slug: SLUG,
        chapterId: z.string().max(60).default("main"),
        titleVi: z.string().min(1).max(160),
        titleEn: z.string().min(1).max(160),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertLearnAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("learn_lessons")
      .select("id", { count: "exact", head: true })
      .eq("course_id", data.courseId);
    const doc = LessonDocSchema.parse({
      title: { vi: data.titleVi, en: data.titleEn },
      steps: [
        {
          id: "s1",
          type: "text",
          title: { vi: data.titleVi, en: data.titleEn },
          body: { vi: "", en: "" },
        },
      ],
    });
    const { error } = await supabaseAdmin.from("learn_lessons").insert({
      course_id: data.courseId,
      slug: data.slug,
      chapter_id: data.chapterId,
      sort_order: count ?? 0,
      draft: doc,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveCourseDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; doc: unknown; track?: string | null; sortOrder?: number }) =>
    z
      .object({
        id: z.string().uuid(),
        doc: z.unknown(),
        track: z.string().max(60).nullable().optional(),
        sortOrder: z.number().int().min(0).max(999).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertLearnAdmin(context);
    const doc = CourseDocSchema.parse(data.doc);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Row = { draft: doc };
    if (data.track !== undefined) patch["track"] = data.track;
    if (data.sortOrder !== undefined) patch["sort_order"] = data.sortOrder;
    const { error } = await supabaseAdmin
      .from("learn_courses")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveLessonDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; doc: unknown; chapterId?: string; sortOrder?: number }) =>
    z
      .object({
        id: z.string().uuid(),
        doc: z.unknown(),
        chapterId: z.string().max(60).optional(),
        sortOrder: z.number().int().min(0).max(999).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertLearnAdmin(context);
    const doc = LessonDocSchema.parse(data.doc);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Row = { draft: doc };
    if (data.chapterId !== undefined) patch["chapter_id"] = data.chapterId;
    if (data.sortOrder !== undefined) patch["sort_order"] = data.sortOrder;
    const { error } = await supabaseAdmin
      .from("learn_lessons")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const PublishInput = z.object({
  entity: z.enum(["course", "lesson"]),
  id: z.string().uuid(),
  note: z.string().max(300).default(""),
});

export const publishContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof PublishInput>) => PublishInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertLearnAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.entity === "course" ? "learn_courses" : "learn_lessons";
    const { data: row, error: readError } = await supabaseAdmin
      .from(table)
      .select("id, draft, version")
      .eq("id", data.id)
      .maybeSingle();
    if (readError || !row) throw new Error(readError?.message ?? "not_found");

    const doc =
      data.entity === "course"
        ? CourseDocSchema.parse((row as Row)["draft"])
        : LessonDocSchema.parse((row as Row)["draft"]);
    const version = Number((row as Row)["version"] ?? 0) + 1;

    const { error } = await supabaseAdmin
      .from(table)
      .update({
        published: doc,
        status: "published",
        version,
        published_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("learn_content_versions").insert({
      entity: data.entity,
      entity_id: data.id,
      version,
      doc,
      note: data.note,
      actor: context.userId,
    });
    return { ok: true, version };
  });

export const unpublishContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entity: "course" | "lesson"; id: string }) =>
    z.object({ entity: z.enum(["course", "lesson"]), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertLearnAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.entity === "course" ? "learn_courses" : "learn_lessons";
    const { error } = await supabaseAdmin.from(table).update({ status: "draft" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entity: "course" | "lesson"; id: string }) =>
    z.object({ entity: z.enum(["course", "lesson"]), id: z.string().uuid() }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ versions: { id: string; version: number; note: string; createdAt: string }[] }> => {
      await assertLearnAdmin(context);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows } = await supabaseAdmin
        .from("learn_content_versions")
        .select("id, version, note, created_at")
        .eq("entity", data.entity)
        .eq("entity_id", data.id)
        .order("version", { ascending: false })
        .limit(30);
      return {
        versions: ((rows ?? []) as Row[]).map((r) => ({
          id: String(r["id"]),
          version: Number(r["version"] ?? 0),
          note: String(r["note"] ?? ""),
          createdAt: String(r["created_at"] ?? ""),
        })),
      };
    },
  );

/** Restores an older version into the draft slot (never straight to live). */
export const restoreVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { versionId: string }) =>
    z.object({ versionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertLearnAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("learn_content_versions")
      .select("entity, entity_id, doc")
      .eq("id", data.versionId)
      .maybeSingle();
    if (!row) throw new Error("not_found");
    const entity = String((row as Row)["entity"]);
    const table = entity === "course" ? "learn_courses" : "learn_lessons";
    const { error } = await supabaseAdmin
      .from(table)
      .update({ draft: (row as Row)["doc"] } as never)
      .eq("id", String((row as Row)["entity_id"]));
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entity: "course" | "lesson"; id: string }) =>
    z.object({ entity: z.enum(["course", "lesson"]), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertLearnAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.entity === "course" ? "learn_courses" : "learn_lessons";
    const { error } = await supabaseAdmin.from(table).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Academy-wide analytics for the admin dashboard. */
export const learnAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertLearnAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: progress }, { count: dueCards }] = await Promise.all([
      supabaseAdmin.from("learn_progress").select("user_id, status, mastery, last_studied_at"),
      supabaseAdmin
        .from("learn_cards")
        .select("id", { count: "exact", head: true })
        .lte("due_at", new Date().toISOString()),
    ]);
    const rows = (progress ?? []) as Row[];
    const learners = new Set(rows.map((r) => String(r["user_id"])));
    const completed = rows.filter((r) => r["status"] === "completed").length;
    const weekAgo = Date.now() - 7 * 86_400_000;
    const active = new Set(
      rows
        .filter((r) => new Date(String(r["last_studied_at"] ?? 0)).getTime() >= weekAgo)
        .map((r) => String(r["user_id"])),
    );
    const mastery = rows.length
      ? Math.round(rows.reduce((sum, r) => sum + Number(r["mastery"] ?? 0), 0) / rows.length)
      : 0;
    return {
      learners: learners.size,
      activeLearners7d: active.size,
      startedLessons: rows.length,
      completedLessons: completed,
      avgMastery: mastery,
      dueCards: dueCards ?? 0,
    };
  });
