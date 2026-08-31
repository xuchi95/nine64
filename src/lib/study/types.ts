/**
 * Nine64 Study & Sharing — shared data model.
 *
 * A study is a list of chapters; a chapter owns a move *tree* (variations are
 * siblings, not a flat list) plus per-node annotations: comment, NAGs, arrows
 * and highlighted squares. The same shape survives a PGN round-trip, so an
 * imported PGN keeps its headers, comments and variations.
 */

export const SHARE_MODES = ["game", "position", "annotated", "study"] as const;
export type ShareMode = (typeof SHARE_MODES)[number];

export const VISIBILITIES = ["private", "unlisted", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** Drawn arrow between two squares, e.g. `{ from: "e2", to: "e4" }`. */
export interface StudyArrow {
  from: string;
  to: string;
  /** Semantic colour key; the viewer maps it to a design token. */
  color?: "brass" | "green" | "red" | "blue";
}

export interface StudyHighlight {
  square: string;
  color?: "brass" | "green" | "red" | "blue";
}

/** One half-move in the tree. `children[0]` is the main line. */
export interface StudyNode {
  id: string;
  /** SAN as played from the parent position. */
  san: string;
  /** FEN after the move (denormalised so the viewer never replays the tree). */
  fen: string;
  comment?: string;
  nags?: number[];
  arrows?: StudyArrow[];
  highlights?: StudyHighlight[];
  /** Optional engine evaluation in centipawns from White's point of view. */
  evalCp?: number;
  evalMate?: number;
  children: StudyNode[];
}

export interface StudyChapter {
  id: string;
  name: string;
  /** PGN tag pairs, preserved verbatim on import and re-emitted on export. */
  headers: Record<string, string>;
  /** Starting position; omitted means the standard initial position. */
  startFen?: string;
  /** Comment attached before the first move (PGN "game comment"). */
  comment?: string;
  arrows?: StudyArrow[];
  highlights?: StudyHighlight[];
  result?: string;
  children: StudyNode[];
}

export interface StudyContent {
  chapters: StudyChapter[];
}

export interface StudySummary {
  slug: string;
  title: string;
  description: string | null;
  mode: ShareMode;
  visibility: Visibility;
  revoked: boolean;
  chapterCount: number;
  updatedAt: string;
  createdAt: string;
}

export interface StudyView extends StudySummary {
  content: StudyContent;
  /** Display names for the OG card / header; taken from chapter headers. */
  white: string | null;
  black: string | null;
  result: string | null;
  /** Position shown on the social card and in the embed preview. */
  previewFen: string;
  engineAllowed: boolean;
  ownerName: string | null;
}

export const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Depth-first walk of the main line (always `children[0]`). */
export function mainLine(chapter: StudyChapter): StudyNode[] {
  const line: StudyNode[] = [];
  let node = chapter.children[0];
  while (node) {
    line.push(node);
    node = node.children[0] as StudyNode | undefined as StudyNode;
    if (!node) break;
  }
  return line;
}

/** Find a node by id anywhere in the chapter, with the path that reaches it. */
export function findPath(chapter: StudyChapter, id: string): StudyNode[] | null {
  const walk = (nodes: StudyNode[], trail: StudyNode[]): StudyNode[] | null => {
    for (const node of nodes) {
      const next = [...trail, node];
      if (node.id === id) return next;
      const found = walk(node.children, next);
      if (found) return found;
    }
    return null;
  };
  return walk(chapter.children, []);
}

export function countNodes(chapter: StudyChapter): number {
  const walk = (nodes: StudyNode[]): number =>
    nodes.reduce((sum, n) => sum + 1 + walk(n.children), 0);
  return walk(chapter.children);
}
