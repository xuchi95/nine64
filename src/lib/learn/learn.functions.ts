/**
 * Academy — public content reads and learner-scoped progress.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { initialState, review, type Grade, type SrsState } from "./fsrs";
import type { CourseRecord, LessonProgress, LessonRecord } from "./lessonTypes";

type Row = Record<string, unknown>;

export const listCourses = createServerFn({ method: "GET" })
  .inputValidator((input: { kind?: "course" | "endgame" } | undefined) =>
    z.object({ kind: z.enum(["course", "endgame"]).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<{ courses: CourseRecord[]; lessonCounts: Record<string, number> }> => {
    const { fetchPublishedCourses, publicClient, LESSON_COLS, mapLesson } = await import("./content.server");
    const courses = await fetchPublishedCourses(data.kind);
    const counts: Record<string, number> = {};
    if (courses.length > 0) {
      const { data: rows } = await publicClient()
        .from("learn_lessons")
        .select(LESSON_COLS)
        .eq("status", "published")
        .in("course_id", courses.map((c) => c.id));
      for (const row of rows ?? []) {
        const lesson = mapLesson(row as Row);
        counts[lesson.courseId] = (counts[lesson.courseId] ?? 0) + 1;
      }
    }
    return { courses, lessonCounts: counts };
  });

export const getCourse = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => z.object({ slug: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<{ course: CourseRecord; lessons: LessonRecord[] } | null> => {
    const { fetchPublishedCourse } = await import("./content.server");
    return fetchPublishedCourse(data.slug);
  });

export const getLesson = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => z.object({ slug: z.string().min(1) }).parse(input))
  .handler(
    async ({
      data,
    }): Promise<{ lesson: LessonRecord; course: CourseRecord; siblings: LessonRecord[] } | null> => {
      const { fetchPublishedLesson } = await import("./content.server");
      return fetchPublishedLesson(data.slug);
    },
  );

function mapProgress(row: Row): LessonProgress {
  return {
    lessonId: String(row["lesson_id"]),
    status: String(row["status"] ?? "in_progress") as LessonProgress["status"],
    attempts: Number(row["attempts"] ?? 0),
    mastery: Number(row["mastery"] ?? 0),
    bestScore: Number(row["best_score"] ?? 0),
    lastStudiedAt: (row["last_studied_at"] as string | null) ?? null,
  };
}

/** All lesson progress rows for the signed-in learner. */
export const myProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ progress: LessonProgress[]; dueCards: number }> => {
    const { data } = await context.supabase
      .from("learn_progress")
      .select("lesson_id, status, attempts, mastery, best_score, last_studied_at")
      .eq("user_id", context.userId);
    const { count } = await context.supabase
      .from("learn_cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .lte("due_at", new Date().toISOString());
    return { progress: (data ?? []).map((r) => mapProgress(r as Row)), dueCards: count ?? 0 };
  });

const CompleteInput = z.object({
  lessonId: z.string().uuid(),
  score: z.number().min(0).max(100),
  completed: z.boolean().default(false),
  steps: z
    .array(z.object({ stepId: z.string(), grade: z.number().int().min(1).max(4) }))
    .default([]),
});

/** Records an attempt: mastery, streak metadata and per-step FSRS scheduling. */
export const recordAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof CompleteInput>) => CompleteInput.parse(input))
  .handler(async ({ data, context }): Promise<{ progress: LessonProgress }> => {
    const { supabase, userId } = context;
    const now = new Date();

    const { data: existing } = await supabase
      .from("learn_progress")
      .select("lesson_id, status, attempts, mastery, best_score, last_studied_at")
      .eq("user_id", userId)
      .eq("lesson_id", data.lessonId)
      .maybeSingle();

    const { nextMastery } = await import("./lessonEngine");
    const prev = existing ? mapProgress(existing as Row) : null;
    const mastery = nextMastery(prev?.mastery ?? 0, data.score);
    const attempts = (prev?.attempts ?? 0) + 1;
    const bestScore = Math.max(prev?.bestScore ?? 0, data.score);
    const status = data.completed ? "completed" : "in_progress";

    const { data: saved, error } = await supabase
      .from("learn_progress")
      .upsert(
        {
          user_id: userId,
          lesson_id: data.lessonId,
          status,
          attempts,
          mastery,
          best_score: bestScore,
          last_score: data.score,
          last_studied_at: now.toISOString(),
          completed_at: data.completed ? now.toISOString() : null,
        },
        { onConflict: "user_id,lesson_id" },
      )
      .select("lesson_id, status, attempts, mastery, best_score, last_studied_at")
      .single();
    if (error) throw new Error(error.message);

    for (const step of data.steps) {
      const { data: card } = await supabase
        .from("learn_cards")
        .select("id, difficulty, stability, reps, lapses, due_at, last_review")
        .eq("user_id", userId)
        .eq("lesson_id", data.lessonId)
        .eq("step_id", step.stepId)
        .maybeSingle();
      const state: SrsState = card
        ? {
            difficulty: Number((card as Row)["difficulty"] ?? 5.6),
            stability: Number((card as Row)["stability"] ?? 0),
            reps: Number((card as Row)["reps"] ?? 0),
            lapses: Number((card as Row)["lapses"] ?? 0),
            due: String((card as Row)["due_at"] ?? now.toISOString()),
            lastReview: ((card as Row)["last_review"] as string | null) ?? null,
          }
        : initialState(now);
      const next = review(state, step.grade as Grade, now);
      await supabase.from("learn_cards").upsert(
        {
          user_id: userId,
          lesson_id: data.lessonId,
          step_id: step.stepId,
          difficulty: next.difficulty,
          stability: next.stability,
          reps: next.reps,
          lapses: next.lapses,
          due_at: next.due,
          last_review: next.lastReview,
        },
        { onConflict: "user_id,lesson_id,step_id" },
      );
    }

    return { progress: mapProgress(saved as Row) };
  });

/** Lessons whose review cards are due — used by the Daily Plan. */
export const dueLessons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ lessonIds: string[] }> => {
    const { data } = await context.supabase
      .from("learn_cards")
      .select("lesson_id")
      .eq("user_id", context.userId)
      .lte("due_at", new Date().toISOString())
      .limit(200);
    const ids = new Set<string>((data ?? []).map((r) => String((r as Row)["lesson_id"])));
    return { lessonIds: [...ids] };
  });

/**
 * Lessons matching a weakness tag (e.g. "rook_endgame") so Game Review can
 * hand the learner the exact drill that fixes what it found.
 */
export const lessonsForTags = createServerFn({ method: "GET" })
  .inputValidator((input: { tags: string[]; limit?: number }) =>
    z.object({ tags: z.array(z.string()).max(20), limit: z.number().int().min(1).max(20).default(6) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ lessons: { slug: string; title: { vi: string; en: string }; tags: string[]; courseSlug: string }[] }> => {
    if (data.tags.length === 0) return { lessons: [] };
    const { publicClient, LESSON_COLS, COURSE_COLS, mapLesson, mapCourse } = await import("./content.server");
    const supabase = publicClient();
    const { data: rows } = await supabase
      .from("learn_lessons")
      .select(LESSON_COLS)
      .eq("status", "published")
      .order("sort_order")
      .limit(400);
    const { data: courseRows } = await supabase
      .from("learn_courses")
      .select(COURSE_COLS)
      .eq("status", "published");
    const courseById = new Map(
      (courseRows ?? []).map((r) => {
        const c = mapCourse(r as Row);
        return [c.id, c.slug] as const;
      }),
    );
    const wanted = new Set(data.tags);
    const lessons = (rows ?? [])
      .map((r) => mapLesson(r as Row))
      .filter((l) => l.doc.tags.some((tag) => wanted.has(tag)) || l.doc.dimensions.some((d) => wanted.has(d)))
      .slice(0, data.limit)
      .map((l) => ({
        slug: l.slug,
        title: l.doc.title,
        tags: l.doc.tags,
        courseSlug: courseById.get(l.courseId) ?? "",
      }));
    return { lessons };
  });
