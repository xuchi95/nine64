import { Chess } from "chess.js";
import { formatTimeControl } from "@/lib/chess/timeControls";

export interface SharePayload {
  /** SAN moves in order. */
  moves: string[];
  /** Starting FEN, omitted for the standard position. */
  startFen?: string;
  /** Colour the link recipient is expected to play. */
  turnFor?: "w" | "b";
  /** Free-form labels for the PGN header. */
  white?: string;
  black?: string;
}

const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeShare(payload: SharePayload): string {
  const compact: Record<string, unknown> = { m: payload.moves.join(" ") };
  if (payload.startFen && payload.startFen !== STANDARD_FEN) compact["f"] = payload.startFen;
  if (payload.turnFor) compact["t"] = payload.turnFor;
  if (payload.white) compact["w"] = payload.white;
  if (payload.black) compact["b"] = payload.black;
  return toBase64Url(JSON.stringify(compact));
}

export function decodeShare(token: string): SharePayload | null {
  try {
    const raw = JSON.parse(fromBase64Url(token)) as Record<string, unknown>;
    const movesRaw = typeof raw["m"] === "string" ? (raw["m"] as string) : "";
    const payload: SharePayload = {
      moves: movesRaw.split(/\s+/).filter(Boolean),
    };
    if (typeof raw["f"] === "string") payload.startFen = raw["f"] as string;
    if (raw["t"] === "w" || raw["t"] === "b") payload.turnFor = raw["t"];
    if (typeof raw["w"] === "string") payload.white = raw["w"] as string;
    if (typeof raw["b"] === "string") payload.black = raw["b"] as string;
    return payload;
  } catch {
    return null;
  }
}

export function shareUrl(payload: SharePayload, origin?: string): string {
  const base = origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  return `${base}/play/share?g=${encodeShare(payload)}`;
}

/** Replay SAN moves onto a fresh game; invalid tails are dropped. */
export function replayMoves(
  moves: string[],
  startFen?: string,
): { chess: Chess; applied: string[] } {
  const chess = new Chess();
  if (startFen) {
    try {
      chess.load(startFen);
    } catch {
      chess.reset();
    }
  }
  const applied: string[] = [];
  for (const san of moves) {
    try {
      const move = chess.move(san);
      if (!move) break;
      applied.push(move.san);
    } catch {
      break;
    }
  }
  return { chess, applied };
}

export interface PgnMeta {
  event?: string;
  white?: string;
  black?: string;
  date?: Date;
  result?: string;
  timeControl?: string;
  variant?: string;
  startFen?: string;
}

export function buildPgn(moves: string[], meta: PgnMeta = {}): string {
  const date = meta.date ?? new Date();
  const dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
    date.getDate(),
  ).padStart(2, "0")}`;
  const headers: string[] = [
    `[Event "${meta.event ?? "Nexus Chess"}"]`,
    `[Site "Nexus Chess"]`,
    `[Date "${dateStr}"]`,
    `[White "${meta.white ?? "White"}"]`,
    `[Black "${meta.black ?? "Black"}"]`,
    `[Result "${meta.result ?? "*"}"]`,
  ];
  if (meta.timeControl) headers.push(`[TimeControl "${formatTimeControl(meta.timeControl)}"]`);
  if (meta.variant && meta.variant !== "standard") headers.push(`[Variant "${meta.variant}"]`);
  if (meta.startFen) {
    headers.push(`[SetUp "1"]`, `[FEN "${meta.startFen}"]`);
  }

  const body: string[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const white = moves[i];
    const black = moves[i + 1];
    body.push(`${i / 2 + 1}. ${white ?? ""}${black ? ` ${black}` : ""}`);
  }

  return `${headers.join("\n")}\n\n${body.join(" ")} ${meta.result ?? "*"}`.trim();
}

/** Extract SAN moves from a pasted PGN (headers, comments and NAGs ignored). */
export function parsePgn(pgn: string): { moves: string[]; startFen?: string } {
  const fenMatch = /\[FEN\s+"([^"]+)"\]/.exec(pgn);
  const body = pgn
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/;[^\n]*/g, " ")
    .replace(/\$\d+/g, " ")
    .replace(/\d+\.(\.\.)?/g, " ")
    .replace(/(1-0|0-1|1\/2-1\/2|\*)/g, " ");
  const tokens = body.split(/\s+/).filter(Boolean);
  const result: { moves: string[]; startFen?: string } = { moves: tokens };
  if (fenMatch?.[1]) result.startFen = fenMatch[1];
  return result;
}
