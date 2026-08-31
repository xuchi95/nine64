/**
 * Validation for study payloads. Everything a client sends is bounded here:
 * chapter count, tree size and comment length, so a share can never be used to
 * push megabytes of JSON into the database.
 */
import { z } from "zod";
import { SHARE_MODES, VISIBILITIES, type StudyChapter, type StudyContent, type StudyNode } from "./types";

export const MAX_CHAPTERS = 32;
export const MAX_NODES_PER_CHAPTER = 4_000;
export const MAX_CONTENT_CHARS = 400_000;

const arrowSchema = z.object({
  from: z.string().regex(/^[a-h][1-8]$/),
  to: z.string().regex(/^[a-h][1-8]$/),
  color: z.enum(["brass", "green", "red", "blue"]).optional(),
});

const highlightSchema = z.object({
  square: z.string().regex(/^[a-h][1-8]$/),
  color: z.enum(["brass", "green", "red", "blue"]).optional(),
});

const baseNode = z.object({
  id: z.string().min(1).max(40),
  san: z.string().min(1).max(12),
  fen: z.string().min(10).max(120),
  comment: z.string().max(2_000).optional(),
  nags: z.array(z.number().int().min(0).max(255)).max(8).optional(),
  arrows: z.array(arrowSchema).max(24).optional(),
  highlights: z.array(highlightSchema).max(32).optional(),
  evalCp: z.number().optional(),
  evalMate: z.number().int().optional(),
});

export const nodeSchema: z.ZodType<StudyNode> = baseNode.extend({
  children: z.lazy(() => z.array(nodeSchema).max(24)),
}) as unknown as z.ZodType<StudyNode>;

export const chapterSchema: z.ZodType<StudyChapter> = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  headers: z.record(z.string().max(40), z.string().max(400)).default({}),
  startFen: z.string().min(10).max(120).optional(),
  comment: z.string().max(4_000).optional(),
  arrows: z.array(arrowSchema).max(24).optional(),
  highlights: z.array(highlightSchema).max(32).optional(),
  result: z.string().max(12).optional(),
  children: z.array(nodeSchema).max(24),
}) as unknown as z.ZodType<StudyChapter>;

export const contentSchema: z.ZodType<StudyContent> = z.object({
  chapters: z.array(chapterSchema).min(1).max(MAX_CHAPTERS),
}) as unknown as z.ZodType<StudyContent>;

export const studyMetaSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(600).nullable().optional(),
  mode: z.enum(SHARE_MODES),
  visibility: z.enum(VISIBILITIES),
  engineAllowed: z.boolean().default(true),
});

/** Guard against pathological trees that pass the per-level limits. */
export function assertContentSize(content: StudyContent): void {
  if (JSON.stringify(content).length > MAX_CONTENT_CHARS) {
    throw new Error("STUDY_TOO_LARGE");
  }
  for (const chapter of content.chapters) {
    let count = 0;
    const walk = (nodes: StudyNode[]) => {
      for (const node of nodes) {
        count += 1;
        if (count > MAX_NODES_PER_CHAPTER) throw new Error("STUDY_TOO_LARGE");
        walk(node.children);
      }
    };
    walk(chapter.children);
  }
}
