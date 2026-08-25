import { Chess } from "chess.js";
import { detectOpening } from "@/lib/chess/openings";
import type { SavedGame } from "@/lib/history";
import { translate as t } from "@/lib/i18n";

export type Side = "w" | "b";

/** Replays a SAN path from the start position. Returns null when illegal. */
export function fenForPath(sans: string[]): string | null {
  try {
    const chess = new Chess();
    for (const san of sans) {
      const move = chess.move(san);
      if (!move) return null;
    }
    return chess.fen();
  } catch {
    return null;
  }
}

/** Legal SAN moves in the position reached by `sans`. */
export function legalSansAfter(sans: string[]): string[] {
  try {
    const chess = new Chess();
    for (const san of sans) if (!chess.move(san)) return [];
    return chess.moves();
  } catch {
    return [];
  }
}

export interface LineStat {
  /** Space-joined SAN prefix identifying the line. */
  path: string;
  sans: string[];
  opening: string | null;
  side: Side;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Score percentage (win = 1, draw = 0.5). */
  score: number;
  /** Average centipawn loss of the player's moves inside the prefix. */
  avgLoss: number | null;
  lastPlayed: string | null;
}

function sideOf(game: SavedGame): Side {
  return (game.playerColor ?? "w") as Side;
}

function pointsFor(game: SavedGame, side: Side): number {
  if (game.result.winner === "draw") return 0.5;
  return game.result.winner === side ? 1 : 0;
}

/**
 * Aggregates the player's games into opening lines truncated at `depth` plies.
 * Only games played with `side` count, so White and Black repertoires never mix.
 */
export function topLines(
  games: SavedGame[],
  side: Side,
  depth = 6,
  minGames = 1,
): LineStat[] {
  const buckets = new Map<string, LineStat>();
  for (const game of games) {
    if (sideOf(game) !== side) continue;
    const sans = game.moves.slice(0, depth).map((m) => m.san);
    if (sans.length === 0) continue;
    const path = sans.join(" ");
    let entry = buckets.get(path);
    if (!entry) {
      entry = {
        path,
        sans,
        opening: detectOpening(sans)?.name ?? null,
        side,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        score: 0,
        avgLoss: null,
        lastPlayed: null,
      };
      buckets.set(path, entry);
    }
    entry.games += 1;
    const points = pointsFor(game, side);
    if (points === 1) entry.wins += 1;
    else if (points === 0.5) entry.draws += 1;
    else entry.losses += 1;
    if (!entry.lastPlayed || game.playedAt > entry.lastPlayed) entry.lastPlayed = game.playedAt;

    const plies = game.review?.plies ?? [];
    let sum = 0;
    let count = 0;
    for (let ply = 0; ply < sans.length; ply++) {
      const own: Side = ply % 2 === 0 ? "w" : "b";
      const record = plies[ply];
      if (own !== side || !record) continue;
      sum += record.loss;
      count += 1;
    }
    if (count > 0) {
      const prev = entry.avgLoss === null ? 0 : entry.avgLoss * (entry.games - 1);
      entry.avgLoss = Math.round(((prev + sum / count) / entry.games) * 10) / 10;
    }
  }

  return [...buckets.values()]
    .filter((line) => line.games >= minGames)
    .map((line) => ({
      ...line,
      score: Math.round(((line.wins + line.draws * 0.5) / line.games) * 1000) / 10,
    }))
    .sort((a, b) => b.games - a.games || a.score - b.score);
}

export interface RepertoireSummary {
  side: Side;
  games: number;
  score: number;
  distinctLines: number;
  best: LineStat | null;
  worst: LineStat | null;
}

export function summariseRepertoire(games: SavedGame[], side: Side, depth = 6): RepertoireSummary {
  const lines = topLines(games, side, depth, 1);
  const total = lines.reduce((n, l) => n + l.games, 0);
  const points = lines.reduce((n, l) => n + l.wins + l.draws * 0.5, 0);
  const ranked = [...lines].filter((l) => l.games >= 2);
  const byScore = ranked.length > 0 ? ranked : lines;
  const best = [...byScore].sort((a, b) => b.score - a.score)[0] ?? null;
  const worst = [...byScore].sort((a, b) => a.score - b.score)[0] ?? null;
  return {
    side,
    games: total,
    score: total === 0 ? 0 : Math.round((points / total) * 1000) / 10,
    distinctLines: lines.length,
    best,
    worst: worst && best && worst.path === best.path && byScore.length === 1 ? null : worst,
  };
}

export type FocusKind = "lowScore" | "highLoss" | "narrow" | "unstable";

export interface TrainingFocus {
  id: string;
  kind: FocusKind;
  side: Side;
  path: string;
  sans: string[];
  fen: string | null;
  opening: string | null;
  games: number;
  score: number;
  avgLoss: number | null;
  /** 0-100, higher first. */
  priority: number;
  title: string;
  reason: string;
  task: string;
}

const FOCUS_TITLE_KEY: Record<FocusKind, string> = {
  lowScore: "study.openings.focus.lowScoreTitle",
  highLoss: "study.openings.focus.highLossTitle",
  narrow: "study.openings.focus.narrowTitle",
  unstable: "study.openings.focus.unstableTitle",
};

function lineLabel(line: LineStat): string {
  return line.opening ?? line.path;
}

/**
 * Turns the player's own results into a ranked training plan: the lines that
 * cost the most points, the lines played with the highest average loss, and
 * repertoire gaps (a side played almost exclusively through one line).
 */
export function focusSuggestions(games: SavedGame[], depth = 6): TrainingFocus[] {
  const out: TrainingFocus[] = [];

  for (const side of ["w", "b"] as Side[]) {
    const lines = topLines(games, side, depth, 1);
    const played = lines.reduce((n, l) => n + l.games, 0);
    if (played === 0) continue;

    for (const line of lines) {
      if (line.games < 2) continue;
      const label = lineLabel(line);
      if (line.score <= 40) {
        out.push({
          id: `${side}:score:${line.path}`,
          kind: "lowScore",
          side,
          path: line.path,
          sans: line.sans,
          fen: fenForPath(line.sans),
          opening: line.opening,
          games: line.games,
          score: line.score,
          avgLoss: line.avgLoss,
          priority: Math.min(100, Math.round((45 - line.score) * 1.6 + line.games * 4)),
          title: t(FOCUS_TITLE_KEY.lowScore, { line: label }),
          reason: t("study.openings.focus.lowScoreReason", {
            games: String(line.games),
            score: String(line.score),
          }),
          task: t("study.openings.focus.lowScoreTask", { line: label }),
        });
      }
      if (line.avgLoss !== null && line.avgLoss >= 6) {
        out.push({
          id: `${side}:loss:${line.path}`,
          kind: "highLoss",
          side,
          path: line.path,
          sans: line.sans,
          fen: fenForPath(line.sans),
          opening: line.opening,
          games: line.games,
          score: line.score,
          avgLoss: line.avgLoss,
          priority: Math.min(100, Math.round(line.avgLoss * 5 + line.games * 3)),
          title: t(FOCUS_TITLE_KEY.highLoss, { line: label }),
          reason: t("study.openings.focus.highLossReason", {
            loss: String(line.avgLoss),
            games: String(line.games),
          }),
          task: t("study.openings.focus.highLossTask", { line: label }),
        });
      }
      if (line.games >= 3 && line.wins === 0) {
        out.push({
          id: `${side}:unstable:${line.path}`,
          kind: "unstable",
          side,
          path: line.path,
          sans: line.sans,
          fen: fenForPath(line.sans),
          opening: line.opening,
          games: line.games,
          score: line.score,
          avgLoss: line.avgLoss,
          priority: Math.min(100, 55 + line.games * 5),
          title: t(FOCUS_TITLE_KEY.unstable, { line: label }),
          reason: t("study.openings.focus.unstableReason", { games: String(line.games) }),
          task: t("study.openings.focus.unstableTask", { line: label }),
        });
      }
    }

    const main = lines[0];
    if (main && played >= 4 && main.games / played >= 0.75) {
      out.push({
        id: `${side}:narrow:${main.path}`,
        kind: "narrow",
        side,
        path: main.path,
        sans: main.sans,
        fen: fenForPath(main.sans),
        opening: main.opening,
        games: main.games,
        score: main.score,
        avgLoss: main.avgLoss,
        priority: 45,
        title: t(FOCUS_TITLE_KEY.narrow, { line: lineLabel(main) }),
        reason: t("study.openings.focus.narrowReason", {
          share: String(Math.round((main.games / played) * 100)),
        }),
        task: t("study.openings.focus.narrowTask", { line: lineLabel(main) }),
      });
    }
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, 8);
}
