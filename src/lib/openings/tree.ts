import { detectOpening } from "@/lib/chess/openings";
import type { SavedGame } from "@/lib/history";

export interface OpeningNode {
  /** Space-joined SAN path from the start position. */
  path: string;
  san: string;
  ply: number;
  /** Side that plays this move. */
  color: "w" | "b";
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Sum of centipawn loss of this move across games (when reviewed). */
  cplSum: number;
  cplCount: number;
  openingName: string | null;
  children: Map<string, OpeningNode>;
}

export interface OpeningTree {
  root: OpeningNode;
  /** Games contributing to the tree. */
  total: number;
}

function makeNode(path: string, san: string, ply: number): OpeningNode {
  return {
    path,
    san,
    ply,
    color: ply % 2 === 0 ? "w" : "b",
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    cplSum: 0,
    cplCount: 0,
    openingName: null,
    children: new Map(),
  };
}

function scoreFor(game: SavedGame, color: "w" | "b"): 1 | 0 | 0.5 {
  if (game.result.winner === "draw") return 0.5;
  return game.result.winner === color ? 1 : 0;
}

/**
 * Builds a per-user opening trie from saved games. `perspective` decides which
 * side's results are counted (defaults to the human's colour in AI games).
 */
export function buildOpeningTree(games: SavedGame[], maxPly = 14): OpeningTree {
  const root = makeNode("", "start", -1);
  let total = 0;
  for (const game of games) {
    const perspective = game.playerColor ?? "w";
    const score = scoreFor(game, perspective);
    total += 1;
    let node = root;
    node.games += 1;
    const sans: string[] = [];
    game.moves.slice(0, maxPly).forEach((move, ply) => {
      sans.push(move.san);
      const path = sans.join(" ");
      let child = node.children.get(move.san);
      if (!child) {
        child = makeNode(path, move.san, ply);
        node.children.set(move.san, child);
      }
      child.games += 1;
      const own = ply % 2 === 0 ? "w" : "b";
      if (own === perspective) {
        if (score === 1) child.wins += 1;
        else if (score === 0.5) child.draws += 1;
        else child.losses += 1;
      }
      const ply_ = game.review?.plies?.[ply];
      if (ply_ && own === perspective) {
        child.cplSum += ply_.loss;
        child.cplCount += 1;
      }
      child.openingName = detectOpening(sans)?.name ?? child.openingName;
      node = child;
    });
  }
  return { root, total };
}

export interface OpeningRow {
  path: string;
  san: string;
  ply: number;
  games: number;
  winRate: number;
  avgLoss: number | null;
  openingName: string | null;
  color: "w" | "b";
}

export function childRows(node: OpeningNode): OpeningRow[] {
  return [...node.children.values()]
    .map((c) => ({
      path: c.path,
      san: c.san,
      ply: c.ply,
      games: c.games,
      winRate: c.games === 0 ? 0 : Math.round(((c.wins + c.draws * 0.5) / c.games) * 1000) / 10,
      avgLoss: c.cplCount === 0 ? null : Math.round((c.cplSum / c.cplCount) * 10) / 10,
      openingName: c.openingName,
      color: c.color,
    }))
    .sort((a, b) => b.games - a.games);
}

export function nodeAtPath(tree: OpeningTree, path: string): OpeningNode | null {
  if (!path) return tree.root;
  let node: OpeningNode = tree.root;
  for (const san of path.split(" ")) {
    const next = node.children.get(san);
    if (!next) return null;
    node = next;
  }
  return node;
}

/** Deepest node on the path where the player's average loss is worst. */
export function worstLine(tree: OpeningTree, minGames = 2): OpeningRow | null {
  let worst: OpeningRow | null = null;
  const walk = (node: OpeningNode) => {
    for (const child of node.children.values()) {
      if (child.games >= minGames && child.cplCount > 0) {
        const row = {
          path: child.path,
          san: child.san,
          ply: child.ply,
          games: child.games,
          winRate:
            child.games === 0 ? 0 : Math.round(((child.wins + child.draws * 0.5) / child.games) * 1000) / 10,
          avgLoss: Math.round((child.cplSum / child.cplCount) * 10) / 10,
          openingName: child.openingName,
          color: child.color,
        };
        if (!worst || (row.avgLoss ?? 0) > (worst.avgLoss ?? 0)) worst = row;
      }
      walk(child);
    }
  };
  walk(tree.root);
  return worst;
}
