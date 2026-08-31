/**
 * Broadcast PGN parsing.
 *
 * Turns a raw PGN stream (one or many games) into the canonical shape the
 * broadcast tables store: headers, legal-move-validated ply list with FENs,
 * `%clk` clocks and `%eval` evaluations pulled out of comments.
 *
 * Illegal or unreadable tails stop the parse instead of throwing, so a
 * partially broken feed still broadcasts everything up to the bad move.
 */

import { Chess } from "chess.js";
import type { BroadcastMove } from "./types";
import { ecoForPath } from "@/lib/openings/eco.server";

export interface ParsedPgnGame {
  headers: Record<string, string>;
  moves: BroadcastMove[];
  startFen: string | null;
  currentFen: string;
  result: string;
  eco: string | null;
  openingName: string | null;
  /** Clock left for each side after the last move that carried a `%clk`. */
  whiteClockMs: number | null;
  blackClockMs: number | null;
  evalCp: number | null;
  evalMate: number | null;
  pgn: string;
}

/** Split a multi-game PGN blob into individual game texts. */
export function splitPgnGames(pgn: string): string[] {
  const text = pgn.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  const games: string[] = [];
  let current: string[] = [];
  let seenMoves = false;
  for (const line of text.split("\n")) {
    const isHeader = /^\s*\[[^\]]+\]\s*$/.test(line);
    if (isHeader && seenMoves && current.length) {
      games.push(current.join("\n").trim());
      current = [];
      seenMoves = false;
    }
    if (!isHeader && line.trim()) seenMoves = true;
    current.push(line);
  }
  if (current.length) games.push(current.join("\n").trim());
  return games.filter((g) => g.trim().length > 0);
}

function parseHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const re = /\[\s*(\w+)\s*"([^"]*)"\s*\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pgn))) headers[m[1] as string] = m[2] as string;
  return headers;
}

/** `1:23:45`, `12:34` or `45` → milliseconds. */
export function parseClock(value: string): number | null {
  const parts = value.trim().split(":").map((p) => Number.parseFloat(p));
  if (parts.some((p) => !Number.isFinite(p))) return null;
  const [h, m, s] =
    parts.length === 3 ? parts : parts.length === 2 ? [0, parts[0], parts[1]] : [0, 0, parts[0]];
  return Math.max(0, Math.round(((h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0)) * 1000));
}

interface MoveToken {
  san: string;
  clockMs: number | null;
  evalCp: number | null;
  evalMate: number | null;
}

/** Tokenize the movetext, keeping `%clk` / `%eval` annotations per move. */
function tokenizeMovetext(movetext: string): MoveToken[] {
  // Drop variations (broadcasts publish the mainline only) and NAGs.
  let text = movetext;
  for (let i = 0; i < 6; i += 1) text = text.replace(/\([^()]*\)/g, " ");
  text = text.replace(/\$\d+/g, " ");

  const tokens: MoveToken[] = [];
  const re = /(\{[^}]*\})|([KQRBNP]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBNqrbn])?[+#]?|O-O-O|O-O|0-0-0|0-0)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1]) {
      const comment = m[1];
      const last = tokens[tokens.length - 1];
      if (!last) continue;
      const clk = /%clk\s+([\d:.]+)/i.exec(comment);
      if (clk?.[1]) last.clockMs = parseClock(clk[1]);
      const ev = /%eval\s+(#?-?\d+(?:\.\d+)?)/i.exec(comment);
      if (ev?.[1]) {
        if (ev[1].startsWith("#") || ev[1].startsWith("-#")) {
          last.evalMate = Number.parseInt(ev[1].replace("#", ""), 10);
        } else {
          last.evalCp = Math.round(Number.parseFloat(ev[1]) * 100);
        }
      }
      continue;
    }
    const san = (m[2] ?? "").replace(/^0-0-0$/, "O-O-O").replace(/^0-0$/, "O-O");
    if (san) tokens.push({ san, clockMs: null, evalCp: null, evalMate: null });
  }
  return tokens;
}

const RESULT_RE = /(1-0|0-1|1\/2-1\/2|\*)\s*$/;

/** Parse a single PGN game. Never throws on bad movetext. */
export function parsePgnGame(pgn: string): ParsedPgnGame {
  const headers = parseHeaders(pgn);
  const movetext = pgn.replace(/\[\s*\w+\s*"[^"]*"\s*\]/g, " ");
  const startFen = headers["FEN"] ?? null;

  const chess = startFen ? new Chess(startFen) : new Chess();
  const moves: BroadcastMove[] = [];
  let whiteClockMs: number | null = null;
  let blackClockMs: number | null = null;
  let evalCp: number | null = null;
  let evalMate: number | null = null;

  for (const token of tokenizeMovetext(movetext)) {
    let made: { from: string; to: string; promotion?: string } | null = null;
    try {
      const res = chess.move(token.san);
      made = res ? { from: res.from, to: res.to, ...(res.promotion ? { promotion: res.promotion } : {}) } : null;
    } catch {
      break; // Illegal / unreadable tail: keep what we have.
    }
    if (!made) break;
    const white = moves.length % 2 === 0;
    if (token.clockMs !== null) {
      if (white) whiteClockMs = token.clockMs;
      else blackClockMs = token.clockMs;
    }
    if (token.evalCp !== null) {
      evalCp = token.evalCp;
      evalMate = null;
    }
    if (token.evalMate !== null) {
      evalMate = token.evalMate;
      evalCp = null;
    }
    moves.push({
      ply: moves.length + 1,
      san: token.san,
      uci: `${made.from}${made.to}${made.promotion ?? ""}`,
      fen: chess.fen(),
      ...(token.clockMs !== null ? { clockMs: token.clockMs } : {}),
      ...(token.evalCp !== null ? { evalCp: token.evalCp } : {}),
      ...(token.evalMate !== null ? { evalMate: token.evalMate } : {}),
    });
  }

  const resultHeader = headers["Result"];
  const trailing = RESULT_RE.exec(movetext.trim())?.[1];
  const result = resultHeader && resultHeader !== "*" ? resultHeader : (trailing ?? "*");

  const opening = startFen ? null : ecoForPath(moves.map((m) => m.san));

  return {
    headers,
    moves,
    startFen,
    currentFen: chess.fen(),
    result,
    eco: headers["ECO"] ?? opening?.eco ?? null,
    openingName: headers["Opening"] ?? opening?.name ?? null,
    whiteClockMs,
    blackClockMs,
    evalCp,
    evalMate,
    pgn: pgn.trim(),
  };
}

/** Stable identifier for a broadcast game when the source gives none. */
export function externalIdFor(game: ParsedPgnGame, index: number): string {
  const h = game.headers;
  const explicit = h["GameId"] ?? h["Site"];
  const base = [h["Event"], h["Round"], h["White"], h["Black"], h["Date"]]
    .filter(Boolean)
    .join("|");
  const id = explicit && /lichess|chessgames|\d/.test(explicit) && base ? `${base}|${explicit}` : base;
  return (id || `game-${index + 1}`).toLowerCase().replace(/\s+/g, "-").slice(0, 200);
}
