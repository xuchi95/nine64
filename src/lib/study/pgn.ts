/**
 * Study PGN import/export.
 *
 * chess.js only exposes a flat main line, so studies use their own PGN reader
 * and writer. Both directions preserve the three things a study needs:
 * header tag pairs, `{ comments }` (including `[%cal ...]` / `[%csl ...]`
 * arrow and highlight commands) and nested `( variations )`.
 */

import { Chess } from "chess.js";
import {
  STANDARD_FEN,
  type StudyArrow,
  type StudyChapter,
  type StudyHighlight,
  type StudyNode,
} from "./types";

let counter = 0;
/** Stable-enough id for tree nodes; never persisted across imports. */
function nodeId(): string {
  counter += 1;
  return `n${counter.toString(36)}`;
}

const COLOR_CODES: Record<string, StudyArrow["color"]> = {
  G: "green",
  R: "red",
  B: "blue",
  Y: "brass",
};
const COLOR_LETTERS: Record<NonNullable<StudyArrow["color"]>, string> = {
  green: "G",
  red: "R",
  blue: "B",
  brass: "Y",
};

const SQUARE = /^[a-h][1-8]$/;

/** Pull `[%cal Ge2e4]` / `[%csl Rd4]` out of a comment body. */
export function parseCommentCommands(raw: string): {
  text: string;
  arrows: StudyArrow[];
  highlights: StudyHighlight[];
} {
  const arrows: StudyArrow[] = [];
  const highlights: StudyHighlight[] = [];
  const text = raw
    .replace(/\[%cal\s+([^\]]+)\]/g, (_m, body: string) => {
      for (const item of body.split(/[,\s]+/).filter(Boolean)) {
        const from = item.slice(1, 3);
        const to = item.slice(3, 5);
        if (!SQUARE.test(from) || !SQUARE.test(to)) continue;
        const color = COLOR_CODES[item[0] ?? ""] ?? "brass";
        arrows.push({ from, to, color });
      }
      return " ";
    })
    .replace(/\[%csl\s+([^\]]+)\]/g, (_m, body: string) => {
      for (const item of body.split(/[,\s]+/).filter(Boolean)) {
        const square = item.slice(1, 3);
        if (!SQUARE.test(square)) continue;
        highlights.push({ square, color: COLOR_CODES[item[0] ?? ""] ?? "brass" });
      }
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { text, arrows, highlights };
}

function commandsToComment(
  text: string | undefined,
  arrows: StudyArrow[] | undefined,
  highlights: StudyHighlight[] | undefined,
): string | null {
  const parts: string[] = [];
  if (text?.trim()) parts.push(text.trim());
  if (arrows?.length) {
    parts.push(
      `[%cal ${arrows.map((a) => `${COLOR_LETTERS[a.color ?? "brass"]}${a.from}${a.to}`).join(",")}]`,
    );
  }
  if (highlights?.length) {
    parts.push(
      `[%csl ${highlights.map((h) => `${COLOR_LETTERS[h.color ?? "brass"]}${h.square}`).join(",")}]`,
    );
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

type Token =
  | { kind: "move"; san: string }
  | { kind: "comment"; text: string }
  | { kind: "nag"; value: number }
  | { kind: "open" }
  | { kind: "close" }
  | { kind: "result"; value: string };

const RESULTS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);

/** Split a movetext body into structural tokens. */
export function tokenizeMovetext(body: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < body.length) {
    const ch = body[i] as string;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "{") {
      const end = body.indexOf("}", i + 1);
      const text = body.slice(i + 1, end === -1 ? body.length : end);
      tokens.push({ kind: "comment", text });
      i = end === -1 ? body.length : end + 1;
      continue;
    }
    if (ch === ";") {
      const end = body.indexOf("\n", i);
      tokens.push({ kind: "comment", text: body.slice(i + 1, end === -1 ? body.length : end) });
      i = end === -1 ? body.length : end + 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "open" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "close" });
      i += 1;
      continue;
    }
    if (ch === "$") {
      const match = /^\$(\d+)/.exec(body.slice(i));
      if (match) {
        tokens.push({ kind: "nag", value: Number(match[1]) });
        i += match[0].length;
        continue;
      }
    }
    // Move numbers ("12." / "12...") carry no information the tree needs.
    const numMatch = /^\d+\.(\.\.)?/.exec(body.slice(i));
    if (numMatch) {
      i += numMatch[0].length;
      continue;
    }
    const wordMatch = /^[^\s(){};]+/.exec(body.slice(i));
    if (!wordMatch) {
      i += 1;
      continue;
    }
    const word = wordMatch[0];
    i += word.length;
    if (RESULTS.has(word)) {
      tokens.push({ kind: "result", value: word });
      continue;
    }
    const glyph = /^([!?]{1,2})$/.exec(word);
    if (glyph) {
      const map: Record<string, number> = { "!": 1, "?": 2, "!!": 3, "??": 4, "!?": 5, "?!": 6 };
      const nag = map[glyph[1] as string];
      if (nag) tokens.push({ kind: "nag", value: nag });
      continue;
    }
    tokens.push({ kind: "move", san: word });
  }
  return tokens;
}

function loadFen(fen: string | undefined): Chess {
  const chess = new Chess();
  if (fen && fen !== STANDARD_FEN) {
    try {
      chess.load(fen);
    } catch {
      chess.reset();
    }
  }
  return chess;
}

/** Parse header tag pairs; returns the headers plus the remaining movetext. */
export function splitHeaders(pgn: string): { headers: Record<string, string>; body: string } {
  const headers: Record<string, string> = {};
  const lines = pgn.split(/\r?\n/);
  let index = 0;
  for (; index < lines.length; index++) {
    const line = (lines[index] ?? "").trim();
    if (line === "") {
      if (Object.keys(headers).length > 0) continue;
      continue;
    }
    const match = /^\[(\w+)\s+"([\s\S]*)"\]$/.exec(line);
    if (!match) break;
    headers[match[1] as string] = match[2] as string;
  }
  return { headers, body: lines.slice(index).join("\n") };
}

/** Split a multi-game PGN blob into single-game chunks. */
export function splitGames(pgn: string): string[] {
  const normalized = pgn.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  let current: string[] = [];
  let seenMovetext = false;
  for (const line of normalized.split("\n")) {
    const isHeader = /^\[\w+\s+"/.test(line.trim());
    if (isHeader && seenMovetext && current.length > 0) {
      chunks.push(current.join("\n").trim());
      current = [];
      seenMovetext = false;
    }
    if (!isHeader && line.trim() !== "") seenMovetext = true;
    current.push(line);
  }
  if (current.join("").trim()) chunks.push(current.join("\n").trim());
  return chunks.filter(Boolean);
}

/**
 * Parse one PGN game into a chapter. Illegal SAN ends that line but never
 * throws — imported files from other sites are frequently imperfect.
 */
export function parseChapter(pgn: string, fallbackName = "Chương 1"): StudyChapter {
  const { headers, body } = splitHeaders(pgn);
  const startFen = headers["FEN"];
  const chapter: StudyChapter = {
    id: nodeId(),
    name: headers["Event"] && headers["Event"] !== "?" ? headers["Event"] : fallbackName,
    headers,
    children: [],
  };
  if (startFen) chapter.startFen = startFen;
  if (headers["Result"]) chapter.result = headers["Result"];

  const tokens = tokenizeMovetext(body);
  const root = loadFen(startFen);

  /**
   * Each stack frame remembers where a variation branched from: `siblings` is
   * the list the next move is appended to, `fen` the position before it.
   */
  interface Frame {
    siblings: StudyNode[];
    fen: string;
    last: StudyNode | null;
    /** Position before `last` — a variation re-plays the alternative from here. */
    beforeLastFen: string;
  }

  const stack: Frame[] = [
    { siblings: chapter.children, fen: root.fen(), last: null, beforeLastFen: root.fen() },
  ];

  const attachComment = (frame: Frame, raw: string) => {
    const { text, arrows, highlights } = parseCommentCommands(raw);
    const target = frame.last;
    if (!target) {
      if (text) chapter.comment = [chapter.comment, text].filter(Boolean).join(" ");
      if (arrows.length) chapter.arrows = [...(chapter.arrows ?? []), ...arrows];
      if (highlights.length) chapter.highlights = [...(chapter.highlights ?? []), ...highlights];
      return;
    }
    if (text) target.comment = [target.comment, text].filter(Boolean).join(" ");
    if (arrows.length) target.arrows = [...(target.arrows ?? []), ...arrows];
    if (highlights.length) target.highlights = [...(target.highlights ?? []), ...highlights];
  };

  for (const token of tokens) {
    const frame = stack[stack.length - 1] as Frame;
    switch (token.kind) {
      case "move": {
        const board = loadFen(frame.fen);
        let move;
        try {
          move = board.move(token.san);
        } catch {
          move = null;
        }
        if (!move) break;
        const node: StudyNode = { id: nodeId(), san: move.san, fen: board.fen(), children: [] };
        frame.siblings.push(node);
        frame.beforeLastFen = frame.fen;
        frame.last = node;
        frame.fen = node.fen;
        frame.siblings = node.children;
        break;
      }
      case "comment":
        attachComment(frame, token.text);
        break;
      case "nag":
        if (frame.last) frame.last.nags = [...(frame.last.nags ?? []), token.value];
        break;
      case "open": {
        // A variation replaces the move just played: it starts from the
        // position *before* it and its nodes are siblings of that move.
        const parentList = frame.last
          ? findSiblingList(chapter, frame.last)
          : chapter.children;
        stack.push({
          siblings: parentList ?? chapter.children,
          fen: frame.beforeLastFen,
          last: null,
          beforeLastFen: frame.beforeLastFen,
        });
        break;
      }
      case "close":
        if (stack.length > 1) stack.pop();
        break;
      case "result":
        chapter.result = token.value;
        break;
    }
  }

  return chapter;
}

/** Locate the array a node lives in (its parent's children, or the root list). */
function findSiblingList(chapter: StudyChapter, target: StudyNode): StudyNode[] | null {
  if (chapter.children.includes(target)) return chapter.children;
  const walk = (nodes: StudyNode[]): StudyNode[] | null => {
    for (const node of nodes) {
      if (node.children.includes(target)) return node.children;
      const found = walk(node.children);
      if (found) return found;
    }
    return null;
  };
  return walk(chapter.children);
}

export function parseStudyPgn(pgn: string): StudyChapter[] {
  return splitGames(pgn).map((game, index) => parseChapter(game, `Chương ${index + 1}`));
}

const NAG_GLYPH: Record<number, string> = { 1: "!", 2: "?", 3: "!!", 4: "??", 5: "!?", 6: "?!" };

/** Serialise a chapter back to PGN with headers, comments and variations. */
export function chapterToPgn(chapter: StudyChapter): string {
  const headers: Record<string, string> = {
    Event: chapter.headers["Event"] ?? chapter.name,
    Site: chapter.headers["Site"] ?? "Nine64",
    Date: chapter.headers["Date"] ?? "????.??.??",
    White: chapter.headers["White"] ?? "?",
    Black: chapter.headers["Black"] ?? "?",
    Result: chapter.result ?? chapter.headers["Result"] ?? "*",
    ...chapter.headers,
  };
  if (chapter.result) headers["Result"] = chapter.result;
  if (chapter.startFen) {
    headers["SetUp"] = "1";
    headers["FEN"] = chapter.startFen;
  }

  const headerText = Object.entries(headers)
    .map(([key, value]) => `[${key} "${String(value).replace(/"/g, "'")}"]`)
    .join("\n");

  const startChess = loadFen(chapter.startFen);
  const startNumber = Number(startChess.fen().split(" ")[5] ?? 1);
  const startWhite = startChess.turn() === "w";

  const out: string[] = [];
  const gameComment = commandsToComment(chapter.comment, chapter.arrows, chapter.highlights);
  if (gameComment) out.push(`{ ${gameComment} }`);

  /**
   * `nodes[0]` is the line; every other entry is an alternative to it and is
   * emitted as a parenthesised variation (with its own continuation) right
   * after the main move, exactly like standard PGN.
   */
  const render = (nodes: StudyNode[], ply: number, needNumber: boolean) => {
    const [main, ...variations] = nodes;
    if (!main) return;
    const whiteToMove = startWhite ? ply % 2 === 0 : ply % 2 === 1;
    const moveNumber = startNumber + Math.floor((ply + (startWhite ? 0 : 1)) / 2);
    if (whiteToMove) out.push(`${moveNumber}.`);
    else if (needNumber) out.push(`${moveNumber}...`);
    out.push(main.san);
    for (const nag of main.nags ?? []) out.push(NAG_GLYPH[nag] ?? `$${nag}`);
    const comment = commandsToComment(main.comment, main.arrows, main.highlights);
    if (comment) out.push(`{ ${comment} }`);

    for (const variation of variations) {
      out.push("(");
      render([variation], ply, true);
      out.push(")");
    }

    render(main.children, ply + 1, variations.length > 0 || Boolean(comment));
  };

  render(chapter.children, 0, false);
  out.push(chapter.result ?? "*");


  return `${headerText}\n\n${out.join(" ").replace(/\s+/g, " ").replace(/\(\s/g, "(").replace(/\s\)/g, ")").trim()}`;
}

export function studyToPgn(chapters: StudyChapter[]): string {
  return chapters.map(chapterToPgn).join("\n\n");
}
