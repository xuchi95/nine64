/**
 * Server-only helpers shared by the study server functions, the public share
 * page and the embed / OG endpoints.
 */
import { createPublicSupabase } from "@/lib/watch/publicClient.server";
import { STANDARD_FEN, type StudyChapter, type StudyContent, type StudyView } from "./types";

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const nstr = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Last position of the main line — what the social card and embed show. */
export function previewFenOf(chapter: StudyChapter | undefined): string {
  if (!chapter) return STANDARD_FEN;
  let fen = chapter.startFen ?? STANDARD_FEN;
  let node = chapter.children[0];
  while (node) {
    fen = node.fen;
    node = node.children[0];
  }
  return fen;
}

export function derivedMeta(content: StudyContent): {
  white: string | null;
  black: string | null;
  result: string | null;
  previewFen: string;
} {
  const first = content.chapters[0];
  return {
    white: nstr(first?.headers?.["White"] ?? null),
    black: nstr(first?.headers?.["Black"] ?? null),
    result: nstr(first?.result ?? first?.headers?.["Result"] ?? null),
    previewFen: previewFenOf(first),
  };
}

function toContent(raw: unknown): StudyContent {
  const chapters = (raw as { chapters?: unknown })?.chapters;
  return { chapters: Array.isArray(chapters) ? (chapters as StudyChapter[]) : [] };
}

export function rowToStudyView(row: Row): StudyView {
  const content = toContent(row["content"]);
  return {
    slug: str(row["slug"]),
    title: str(row["title"]),
    description: nstr(row["description"]),
    mode: (str(row["mode"]) || "study") as StudyView["mode"],
    visibility: (str(row["visibility"]) || "private") as StudyView["visibility"],
    revoked: row["revoked"] === true,
    chapterCount: content.chapters.length,
    createdAt: str(row["created_at"]),
    updatedAt: str(row["updated_at"]),
    content,
    white: nstr(row["white"]),
    black: nstr(row["black"]),
    result: nstr(row["result"]),
    previewFen: str(row["preview_fen"]) || STANDARD_FEN,
    engineAllowed: row["engine_allowed"] !== false,
    ownerName: nstr(row["owner_name"]),
  };
}

/**
 * Reads a public *or* unlisted study by slug through a security-definer RPC.
 * Unlisted studies are unreachable by table select, so nobody can enumerate
 * them — only someone holding the slug gets a row back.
 */
export async function readStudyBySlug(slug: string): Promise<StudyView | null> {
  const supabase = createPublicSupabase();
  const { data, error } = await supabase.rpc("get_study_by_slug" as never, { _slug: slug } as never);
  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowToStudyView(data as Row);
}

export async function bumpStudyView(slug: string): Promise<void> {
  try {
    const supabase = createPublicSupabase();
    await supabase.rpc("bump_study_view" as never, { _slug: slug } as never);
  } catch {
    /* view counting must never break the page */
  }
}
