/**
 * My Performance — compares what the user actually played against their saved
 * repertoire.
 *
 * Pure functions only (no IO), so the whole comparison is unit-tested and can
 * run either on the client with the local archive or on the server.
 *
 * Fair play: this module only ever looks at *finished* games. Nothing here is
 * exposed while a rated game is in progress.
 */
import type { SavedGame } from "@/lib/history";
import type { RepertoireLine, RepertoireColor } from "./repertoireTypes";

export interface RepertoireIndexEntry {
  path: string;
  san: string;
  kind: "main" | "alternative" | "avoid";
  isOwnMove: boolean;
  notes: string;
  openingName: string | null;
  eco: string | null;
}

/** parentPath -> repertoire moves available at that position. */
export type RepertoireIndex = Map<string, RepertoireIndexEntry[]>;

export function indexRepertoire(lines: RepertoireLine[]): RepertoireIndex {
  const index: RepertoireIndex = new Map();
  for (const line of lines) {
    for (const move of line.moves) {
      const list = index.get(move.parentPath) ?? [];
      list.push({
        path: move.path,
        san: move.san,
        kind: move.kind,
        isOwnMove: move.isOwnMove,
        notes: move.notes,
        openingName: line.openingName,
        eco: line.eco,
      });
      index.set(move.parentPath, list);
    }
  }
  return index;
}

export interface GameComparison {
  gameId: string;
  playedAt: string | null;
  color: RepertoireColor;
  score: 0 | 0.5 | 1;
  /** Ply (0-based) where the user left their repertoire, null when in book. */
  deviationPly: number | null;
  deviationSan: string | null;
  expectedSan: string | null;
  /** True when the opponent left book first (a novelty against the user). */
  opponentDeviationPly: number | null;
  /** First move graded mistake/blunder by review, when available. */
  firstMistakePly: number | null;
  firstMistakeLoss: number | null;
  openingName: string | null;
  bookPlies: number;
}

function scoreOf(game: SavedGame, color: RepertoireColor): 0 | 0.5 | 1 {
  const side = color === "white" ? "w" : "b";
  if (game.result.winner === "draw") return 0.5;
  return game.result.winner === side ? 1 : 0;
}

function lossAt(game: SavedGame, ply: number): number | null {
  const analysis = game.review?.plies?.find((p) => p.index === ply);
  const value = analysis?.cpLoss;
  return typeof value === "number" ? value : null;
}

export function compareGame(game: SavedGame, index: RepertoireIndex, maxPly = 24): GameComparison {
  const color: RepertoireColor = (game.playerColor ?? "w") === "b" ? "black" : "white";
  const sans = game.moves.map((m) => m.san);
  let deviationPly: number | null = null;
  let deviationSan: string | null = null;
  let expectedSan: string | null = null;
  let opponentDeviationPly: number | null = null;
  let openingName: string | null = null;
  let bookPlies = 0;

  for (let ply = 0; ply < Math.min(sans.length, maxPly); ply++) {
    const parentPath = sans.slice(0, ply).join(" ");
    const options = index.get(parentPath) ?? [];
    if (options.length === 0) break;
    const played = sans[ply]!;
    const hit = options.find((o) => o.san === played && o.kind !== "avoid");
    const mine = (color === "white") === (ply % 2 === 0);
    if (hit) {
      bookPlies = ply + 1;
      openingName = hit.openingName ?? openingName;
      continue;
    }
    if (mine) {
      deviationPly = ply;
      deviationSan = played;
      expectedSan = options.find((o) => o.kind === "main")?.san ?? options[0]?.san ?? null;
    } else {
      opponentDeviationPly = ply;
    }
    break;
  }

  let firstMistakePly: number | null = null;
  let firstMistakeLoss: number | null = null;
  for (let ply = 0; ply < Math.min(sans.length, maxPly); ply++) {
    const mine = (color === "white") === (ply % 2 === 0);
    if (!mine) continue;
    const loss = lossAt(game, ply);
    if (loss !== null && loss >= 100) {
      firstMistakePly = ply;
      firstMistakeLoss = loss;
      break;
    }
  }

  return {
    gameId: game.id,
    playedAt: game.playedAt ?? null,
    color,
    score: scoreOf(game, color),
    deviationPly,
    deviationSan,
    expectedSan,
    opponentDeviationPly,
    firstMistakePly,
    firstMistakeLoss,
    openingName,
    bookPlies,
  };
}

export interface OpeningLeak {
  key: string;
  path: string;
  openingName: string | null;
  color: RepertoireColor;
  games: number;
  score: number;
  /** Total centipawns lost in this opening across games, when reviewed. */
  cpLost: number;
  deviations: number;
  /** Higher = fix this first. */
  severity: number;
  expectedSan: string | null;
  playedSan: string | null;
}

/**
 * Ranks the most expensive opening problems: low score + repeated repertoire
 * deviation + centipawns burnt early.
 */
export function openingLeaks(
  games: SavedGame[],
  index: RepertoireIndex,
  comparisons: GameComparison[],
  minGames = 2,
): OpeningLeak[] {
  const byGame = new Map(comparisons.map((c) => [c.gameId, c]));
  const buckets = new Map<string, OpeningLeak>();
  for (const game of games) {
    const cmp = byGame.get(game.id);
    if (!cmp) continue;
    const sans = game.moves.map((m) => m.san);
    const cut = cmp.deviationPly ?? Math.min(sans.length, 8);
    const path = sans.slice(0, Math.max(cut, 1)).join(" ");
    const key = `${cmp.color}|${path}`;
    const entry =
      buckets.get(key) ??
      ({
        key,
        path,
        openingName: cmp.openingName,
        color: cmp.color,
        games: 0,
        score: 0,
        cpLost: 0,
        deviations: 0,
        severity: 0,
        expectedSan: cmp.expectedSan,
        playedSan: cmp.deviationSan,
      } satisfies OpeningLeak);
    entry.games += 1;
    entry.score += cmp.score;
    entry.deviations += cmp.deviationPly !== null ? 1 : 0;
    entry.cpLost += cmp.firstMistakeLoss ?? 0;
    buckets.set(key, entry);
  }
  const out = [...buckets.values()]
    .filter((e) => e.games >= minGames)
    .map((e) => {
      const scorePct = e.score / e.games;
      const severity = Math.round(
        (1 - scorePct) * 100 + (e.deviations / e.games) * 40 + Math.min(e.cpLost / e.games, 300) / 5,
      );
      return { ...e, score: scorePct, severity };
    });
  return out.sort((a, b) => b.severity - a.severity);
}

export interface Novelty {
  gameId: string;
  ply: number;
  san: string;
  color: RepertoireColor;
  path: string;
  playedAt: string | null;
}

/**
 * Novelty detector — opponent moves that left the user's repertoire book.
 * Post-game only: these are surfaced from finished games so they can never be
 * used as assistance during a rated game.
 */
export function detectNovelties(
  games: SavedGame[],
  comparisons: GameComparison[],
  limit = 20,
): Novelty[] {
  const byGame = new Map(comparisons.map((c) => [c.gameId, c]));
  const out: Novelty[] = [];
  for (const game of games) {
    const cmp = byGame.get(game.id);
    if (!cmp || cmp.opponentDeviationPly === null) continue;
    const sans = game.moves.map((m) => m.san);
    const ply = cmp.opponentDeviationPly;
    const san = sans[ply];
    if (!san) continue;
    out.push({
      gameId: game.id,
      ply,
      san,
      color: cmp.color,
      path: sans.slice(0, ply).join(" "),
      playedAt: game.playedAt ?? null,
    });
  }
  return out
    .sort((a, b) => (b.playedAt ?? "").localeCompare(a.playedAt ?? ""))
    .slice(0, limit);
}

export interface PerformanceSummary {
  games: number;
  inBook: number;
  bookAccuracy: number;
  score: number;
  scoreInBook: number;
  scoreOutOfBook: number;
  averageBookPlies: number;
}

export function summarisePerformance(comparisons: GameComparison[]): PerformanceSummary {
  const games = comparisons.length;
  if (games === 0) {
    return {
      games: 0,
      inBook: 0,
      bookAccuracy: 0,
      score: 0,
      scoreInBook: 0,
      scoreOutOfBook: 0,
      averageBookPlies: 0,
    };
  }
  const inBookGames = comparisons.filter((c) => c.deviationPly === null);
  const outGames = comparisons.filter((c) => c.deviationPly !== null);
  const avg = (list: GameComparison[]) =>
    list.length ? list.reduce((s, c) => s + c.score, 0) / list.length : 0;
  return {
    games,
    inBook: inBookGames.length,
    bookAccuracy: inBookGames.length / games,
    score: avg(comparisons),
    scoreInBook: avg(inBookGames),
    scoreOutOfBook: avg(outGames),
    averageBookPlies: comparisons.reduce((s, c) => s + c.bookPlies, 0) / games,
  };
}
