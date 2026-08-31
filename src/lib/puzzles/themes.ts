/**
 * Canonical puzzle theme vocabulary. Kept in sync with `public.puzzle_themes`
 * (the DB row set is the editable surface, this list is the type-safe contract).
 */
import { Chess } from "chess.js";
import type { PuzzlePly } from "./types";

export const THEME_KEYS = [
  "fork",
  "pin",
  "skewer",
  "discovered_attack",
  "deflection",
  "decoy",
  "sacrifice",
  "mate",
  "back_rank",
  "zwischenzug",
  "removing_defender",
  "promotion",
  "endgame",
  "defence",
  "only_move",
  "quiet_move",
  "opening_tactics",
] as const;

export type ThemeKey = (typeof THEME_KEYS)[number];

const KEY_SET = new Set<string>(THEME_KEYS);

export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === "string" && KEY_SET.has(value);
}

export function coerceThemes(values: readonly unknown[] | null | undefined): ThemeKey[] {
  if (!values) return [];
  return [...new Set(values.filter(isThemeKey))];
}

/** Lichess-style theme tags mapped into the Nine64 vocabulary. */
const EXTERNAL_ALIASES: Record<string, ThemeKey> = {
  fork: "fork",
  pin: "pin",
  skewer: "skewer",
  discoveredattack: "discovered_attack",
  deflection: "deflection",
  attraction: "decoy",
  decoy: "decoy",
  sacrifice: "sacrifice",
  mate: "mate",
  matein1: "mate",
  matein2: "mate",
  matein3: "mate",
  matein4: "mate",
  matein5: "mate",
  smotheredmate: "mate",
  backrankmate: "back_rank",
  backrank: "back_rank",
  intermezzo: "zwischenzug",
  zwischenzug: "zwischenzug",
  clearance: "removing_defender",
  defensivemove: "defence",
  promotion: "promotion",
  underpromotion: "promotion",
  advancedpawn: "promotion",
  endgame: "endgame",
  rookendgame: "endgame",
  pawnendgame: "endgame",
  queenendgame: "endgame",
  bishopendgame: "endgame",
  knightendgame: "endgame",
  queenrookendgame: "endgame",
  onlymove: "only_move",
  quietmove: "quiet_move",
  opening: "opening_tactics",
  removethedefender: "removing_defender",
  xrayattack: "skewer",
  hangingpiece: "fork",
};

export function mapExternalThemes(tags: readonly string[]): ThemeKey[] {
  const out: ThemeKey[] = [];
  for (const raw of tags) {
    const key = raw.trim().toLowerCase().replace(/[\s_-]/g, "");
    const mapped = EXTERNAL_ALIASES[key];
    if (mapped) out.push(mapped);
  }
  return [...new Set(out)];
}

/* ----------------------------- theme detection ---------------------------- */

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * Derive themes from the actual solution line. Deterministic: only board facts,
 * never an LLM. Used by both the importer (when a dataset has no tags) and the
 * personal-mistake generator.
 */
export function detectThemesFromLine(fen: string, line: readonly PuzzlePly[]): ThemeKey[] {
  const themes = new Set<ThemeKey>();
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return [];
  }
  const solverColor = chess.turn();
  const pieceCount = chess
    .board()
    .flat()
    .filter((sq) => sq !== null).length;
  if (pieceCount <= 12) themes.add("endgame");
  if (chess.moveNumber() <= 12 && pieceCount >= 26) themes.add("opening_tactics");
  if (chess.isCheck()) themes.add("defence");
  if (chess.moves().length === 1) themes.add("only_move");

  for (let i = 0; i < line.length; i += 1) {
    const ply = line[i];
    if (!ply) break;
    const solverMove = i % 2 === 0;
    let applied;
    try {
      applied = chess.move({
        from: ply.uci.slice(0, 2),
        to: ply.uci.slice(2, 4),
        promotion: (ply.uci[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
      });
    } catch {
      break;
    }
    if (!applied) break;
    if (!solverMove) continue;

    if (applied.promotion) themes.add("promotion");
    if (chess.isCheckmate()) {
      themes.add("mate");
      if (isBackRankMate(chess, solverColor)) themes.add("back_rank");
    }
    if (applied.captured) {
      const gain = PIECE_VALUE[applied.captured] ?? 0;
      const risk = PIECE_VALUE[applied.piece] ?? 0;
      if (risk > gain + 1) themes.add("sacrifice");
      if (isDefendedSquare(chess, applied.to, solverColor)) themes.add("removing_defender");
    } else if (!chess.isCheck() && i > 0) {
      themes.add("quiet_move");
    }
    if (applied.san.includes("+") && applied.captured && i > 0) themes.add("zwischenzug");

    const motifs = geometryMotifs(chess, applied.to, solverColor);
    motifs.forEach((m) => themes.add(m));
  }
  return [...themes];
}

function isDefendedSquare(chess: Chess, square: string, solver: "w" | "b"): boolean {
  return chess.isAttacked(square as never, solver === "w" ? "b" : "w");
}

function isBackRankMate(chess: Chess, solver: "w" | "b"): boolean {
  const enemy = solver === "w" ? "b" : "w";
  const rank = enemy === "w" ? "1" : "8";
  const king = chess
    .board()
    .flat()
    .find((sq) => sq && sq.type === "k" && sq.color === enemy);
  return !!king && king.square.endsWith(rank);
}

/** Fork / pin / skewer / discovered attack detected from the resulting position. */
function geometryMotifs(chess: Chess, to: string, solver: "w" | "b"): ThemeKey[] {
  const out: ThemeKey[] = [];
  const enemy = solver === "w" ? "b" : "w";
  const board = chess.board().flat().filter((sq): sq is NonNullable<typeof sq> => sq !== null);
  const mover = board.find((sq) => sq.square === to);
  if (!mover) return out;

  // Fork: the moved piece now attacks 2+ valuable enemy pieces.
  const attacked = board.filter(
    (sq) =>
      sq.color === enemy &&
      (PIECE_VALUE[sq.type] ?? 0) >= (PIECE_VALUE[mover.type] ?? 0) &&
      attacksSquare(chess, to, sq.square, solver),
  );
  if (attacked.length >= 2) out.push("fork");

  // Pin / skewer: a slider on a line with two enemy pieces behind each other.
  if (mover.type === "b" || mover.type === "r" || mover.type === "q") {
    const line = lineTargets(board, to, mover.type, enemy);
    if (line) {
      const [front, back] = line;
      out.push((PIECE_VALUE[front.type] ?? 0) < (PIECE_VALUE[back.type] ?? 0) ? "pin" : "skewer");
    }
  }

  // Discovered attack: an own slider elsewhere now gives check but wasn't the mover.
  if (chess.isCheck()) {
    const checkers = board.filter(
      (sq) =>
        sq.color === solver &&
        sq.square !== to &&
        (sq.type === "b" || sq.type === "r" || sq.type === "q") &&
        attacksKing(chess, sq.square, enemy, solver),
    );
    if (checkers.length > 0) out.push("discovered_attack");
  }
  return out;
}

function attacksSquare(chess: Chess, from: string, target: string, solver: "w" | "b"): boolean {
  // chess.js exposes attack maps only per colour; emulate by probing the piece's
  // pseudo-legal reach in a position where it is that colour's turn.
  const probe = new Chess();
  try {
    probe.load(forceTurn(chess.fen(), solver));
  } catch {
    return false;
  }
  return probe
    .moves({ square: from as never, verbose: true })
    .some((m) => (m as { to: string }).to === target);
}

function attacksKing(chess: Chess, from: string, enemy: "w" | "b", solver: "w" | "b"): boolean {
  const king = chess
    .board()
    .flat()
    .find((sq) => sq && sq.type === "k" && sq.color === enemy);
  return !!king && attacksSquare(chess, from, king.square, solver);
}

function forceTurn(fen: string, turn: "w" | "b"): string {
  const parts = fen.split(" ");
  parts[1] = turn;
  parts[3] = "-";
  return parts.join(" ");
}

const FILES = "abcdefgh";

function lineTargets(
  board: { square: string; type: string; color: string }[],
  from: string,
  sliderType: string,
  enemy: string,
): [{ type: string }, { type: string }] | null {
  const dirs: number[][] = [];
  if (sliderType === "r" || sliderType === "q") dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
  if (sliderType === "b" || sliderType === "q") dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
  const fx = FILES.indexOf(from[0] ?? "");
  const fy = Number(from[1]) - 1;
  const at = (x: number, y: number) =>
    board.find((sq) => sq.square === `${FILES[x]}${y + 1}`) ?? null;

  for (const [dx, dy] of dirs) {
    const hits: { type: string; color: string }[] = [];
    let x = fx + (dx ?? 0);
    let y = fy + (dy ?? 0);
    while (x >= 0 && x < 8 && y >= 0 && y < 8 && hits.length < 2) {
      const piece = at(x, y);
      if (piece) {
        if (piece.color !== enemy) break;
        hits.push(piece);
      }
      x += dx ?? 0;
      y += dy ?? 0;
    }
    if (hits.length === 2 && hits[0] && hits[1]) return [hits[0], hits[1]];
  }
  return null;
}
