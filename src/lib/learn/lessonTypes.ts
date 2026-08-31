/**
 * Nine64 Academy — lesson content model.
 *
 * Lessons are DATA, never React code: every course/lesson lives in the
 * database as a versioned JSON document validated by the schemas below.
 * The runtime (LessonPlayer) only knows these step types.
 */
import { z } from "zod";

export type LocaleKey = "vi" | "en";

export const I18nTextSchema = z.object({
  vi: z.string().default(""),
  en: z.string().default(""),
});
export type I18nText = z.infer<typeof I18nTextSchema>;

export const STEP_TYPES = [
  "text",
  "board",
  "find_move",
  "multiple_choice",
  "drag_piece",
  "play_continuation",
  "engine_challenge",
  "checkpoint_quiz",
] as const;
export type StepType = (typeof STEP_TYPES)[number];

const ArrowSchema = z.object({
  from: z.string(),
  to: z.string(),
  /** 0 = primary (boldest); deeper values fade out. */
  ply: z.number().int().min(0).default(0),
});
export type LessonArrow = z.infer<typeof ArrowSchema>;

const OptionSchema = z.object({
  id: z.string(),
  text: I18nTextSchema,
  correct: z.boolean().default(false),
  feedback: I18nTextSchema.optional(),
});
export type QuizOption = z.infer<typeof OptionSchema>;

const QuestionSchema = z.object({
  id: z.string(),
  prompt: I18nTextSchema,
  options: z.array(OptionSchema).min(2),
});
export type QuizQuestion = z.infer<typeof QuestionSchema>;

export const SUCCESS_KINDS = [
  "expected_move",
  "any_expected",
  "checkmate",
  "reach_fen",
  "no_loss_in_line",
  "engine_result",
] as const;

const SuccessSchema = z.object({
  kind: z.enum(SUCCESS_KINDS).default("expected_move"),
  /** For reach_fen. */
  fen: z.string().optional(),
  /** For engine_result: the acceptable outcomes. */
  results: z.array(z.enum(["win", "draw"])).optional(),
  /** For no_loss_in_line / engine_result: how many plies must be survived. */
  plies: z.number().int().min(1).optional(),
});
export type SuccessCondition = z.infer<typeof SuccessSchema>;

export const StepSchema = z.object({
  id: z.string().min(1),
  type: z.enum(STEP_TYPES),
  title: I18nTextSchema.optional(),
  body: I18nTextSchema.optional(),
  /** Position for every board-bearing step. */
  fen: z.string().optional(),
  orientation: z.enum(["white", "black"]).optional(),
  arrows: z.array(ArrowSchema).default([]),
  highlights: z.array(z.string()).default([]),
  /** Accepted answers, SAN or UCI (case-insensitive, normalised at check time). */
  expectedMoves: z.array(z.string()).default([]),
  /** Playable but sub-optimal answers — accepted with a caveat. */
  alternateMoves: z
    .array(z.object({ move: z.string(), note: I18nTextSchema.optional() }))
    .default([]),
  /** drag_piece: piece must land on one of these squares. */
  targetSquares: z.array(z.string()).default([]),
  /** play_continuation: SAN line; the user side's plies are the answers. */
  line: z.array(z.string()).default([]),
  /** Side the learner plays in play_continuation / engine_challenge. */
  userColor: z.enum(["white", "black"]).optional(),
  /** engine_challenge tuning. */
  engineLevel: z.number().int().min(1).max(15).optional(),
  maxMoves: z.number().int().min(1).max(120).optional(),
  options: z.array(OptionSchema).default([]),
  questions: z.array(QuestionSchema).default([]),
  explanation: I18nTextSchema.optional(),
  hint: I18nTextSchema.optional(),
  success: SuccessSchema.optional(),
});
export type LessonStep = z.infer<typeof StepSchema>;

export const LessonDocSchema = z.object({
  title: I18nTextSchema,
  summary: I18nTextSchema.default({ vi: "", en: "" }),
  estimatedMinutes: z.number().int().min(1).max(120).default(6),
  /** Free tags used by the Daily Plan to match weaknesses (e.g. "rook_endgame"). */
  tags: z.array(z.string()).default([]),
  /** Brain dimensions this lesson trains. */
  dimensions: z.array(z.string()).default([]),
  steps: z.array(StepSchema).default([]),
});
export type LessonDoc = z.infer<typeof LessonDocSchema>;

export const ChapterSchema = z.object({
  id: z.string().min(1),
  title: I18nTextSchema,
  summary: I18nTextSchema.optional(),
});
export type Chapter = z.infer<typeof ChapterSchema>;

export const CourseDocSchema = z.object({
  title: I18nTextSchema,
  summary: I18nTextSchema.default({ vi: "", en: "" }),
  level: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  tags: z.array(z.string()).default([]),
  chapters: z.array(ChapterSchema).default([]),
});
export type CourseDoc = z.infer<typeof CourseDocSchema>;

export type ContentStatus = "draft" | "published" | "archived";
export type CourseKind = "course" | "endgame";

export interface CourseRecord {
  id: string;
  slug: string;
  kind: CourseKind;
  track: string | null;
  sortOrder: number;
  status: ContentStatus;
  version: number;
  doc: CourseDoc;
  publishedAt: string | null;
}

export interface LessonRecord {
  id: string;
  slug: string;
  courseId: string;
  courseSlug?: string;
  chapterId: string;
  sortOrder: number;
  status: ContentStatus;
  version: number;
  doc: LessonDoc;
  publishedAt: string | null;
}

export interface LessonProgress {
  lessonId: string;
  status: "not_started" | "in_progress" | "completed";
  attempts: number;
  mastery: number;
  bestScore: number;
  lastStudiedAt: string | null;
}

export const EMPTY_TEXT: I18nText = { vi: "", en: "" };

/** Reads a localized field with a graceful fallback to the other locale. */
export function localized(text: I18nText | undefined, locale: LocaleKey): string {
  if (!text) return "";
  const primary = locale === "vi" ? text.vi : text.en;
  if (primary && primary.trim()) return primary;
  const other = locale === "vi" ? text.en : text.vi;
  return other ?? "";
}

/** Parses an unknown JSON blob into a lesson doc, never throwing. */
export function safeLessonDoc(raw: unknown): LessonDoc {
  const parsed = LessonDocSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return LessonDocSchema.parse({ title: EMPTY_TEXT });
}

export function safeCourseDoc(raw: unknown): CourseDoc {
  const parsed = CourseDocSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return CourseDocSchema.parse({ title: EMPTY_TEXT });
}

/** Steps that require an answer (used for scoring / progress). */
export function isInteractive(step: LessonStep): boolean {
  return step.type !== "text" && step.type !== "board";
}
