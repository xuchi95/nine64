/**
 * Academy content access (server-only).
 *
 * Published content is read through a publishable-key client (RLS as anon),
 * so drafts can never leak; admin writes go through the service-role client.
 */
import { createClient } from "@supabase/supabase-js";
import {
  safeCourseDoc,
  safeLessonDoc,
  type ContentStatus,
  type CourseKind,
  type CourseRecord,
  type LessonRecord,
} from "./lessonTypes";

type Row = Record<string, unknown>;

const COURSE_COLS =
  "id, slug, kind, track, sort_order, status, version, published, published_at";
const LESSON_COLS =
  "id, slug, course_id, chapter_id, sort_order, status, version, published, published_at";

export function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export function mapCourse(row: Row, useDraft = false): CourseRecord {
  return {
    id: String(row["id"]),
    slug: String(row["slug"]),
    kind: (String(row["kind"] ?? "course") as CourseKind),
    track: (row["track"] as string | null) ?? null,
    sortOrder: Number(row["sort_order"] ?? 0),
    status: String(row["status"] ?? "draft") as ContentStatus,
    version: Number(row["version"] ?? 0),
    doc: safeCourseDoc(useDraft ? row["draft"] : (row["published"] ?? row["draft"])),
    publishedAt: (row["published_at"] as string | null) ?? null,
  };
}

export function mapLesson(row: Row, useDraft = false): LessonRecord {
  return {
    id: String(row["id"]),
    slug: String(row["slug"]),
    courseId: String(row["course_id"]),
    chapterId: String(row["chapter_id"] ?? "main"),
    sortOrder: Number(row["sort_order"] ?? 0),
    status: String(row["status"] ?? "draft") as ContentStatus,
    version: Number(row["version"] ?? 0),
    doc: safeLessonDoc(useDraft ? row["draft"] : (row["published"] ?? row["draft"])),
    publishedAt: (row["published_at"] as string | null) ?? null,
  };
}

/** Published courses of a kind, ordered for display. */
export async function fetchPublishedCourses(kind?: CourseKind): Promise<CourseRecord[]> {
  const supabase = publicClient();
  let query = supabase
    .from("learn_courses")
    .select(COURSE_COLS)
    .eq("status", "published")
    .order("sort_order")
    .order("slug");
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapCourse(r as Row));
}

export async function fetchPublishedCourse(
  slug: string,
): Promise<{ course: CourseRecord; lessons: LessonRecord[] } | null> {
  const supabase = publicClient();
  const { data } = await supabase
    .from("learn_courses")
    .select(COURSE_COLS)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!data) return null;
  const course = mapCourse(data as Row);
  const { data: lessonRows } = await supabase
    .from("learn_lessons")
    .select(LESSON_COLS)
    .eq("course_id", course.id)
    .eq("status", "published")
    .order("sort_order");
  return { course, lessons: (lessonRows ?? []).map((r) => mapLesson(r as Row)) };
}

export async function fetchPublishedLesson(
  slug: string,
): Promise<{ lesson: LessonRecord; course: CourseRecord; siblings: LessonRecord[] } | null> {
  const supabase = publicClient();
  const { data } = await supabase
    .from("learn_lessons")
    .select(LESSON_COLS)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!data) return null;
  const lesson = mapLesson(data as Row);
  const { data: courseRow } = await supabase
    .from("learn_courses")
    .select(COURSE_COLS)
    .eq("id", lesson.courseId)
    .maybeSingle();
  if (!courseRow) return null;
  const course = mapCourse(courseRow as Row);
  const { data: siblingRows } = await supabase
    .from("learn_lessons")
    .select(LESSON_COLS)
    .eq("course_id", lesson.courseId)
    .eq("status", "published")
    .order("sort_order");
  const siblings = (siblingRows ?? []).map((r) => mapLesson(r as Row));
  return { lesson: { ...lesson, courseSlug: course.slug }, course, siblings };
}

export { COURSE_COLS, LESSON_COLS };
