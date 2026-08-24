/**
 * Rating manipulation detection: sandbagging (losing on purpose to drop rating)
 * and boosting/collusion (farming rating from a partner account).
 *
 * These are the cheats a pure engine-match detector never sees, because the moves
 * themselves look human — the *pattern of results* is the anomaly.
 */

export interface GameRecord {
  gameId: string;
  opponentId: string;
  /** 1 = win, 0.5 = draw, 0 = loss, from this player's point of view. */
  score: number;
  /** Own moves played in the game. */
  moves: number;
  /** Own mean win-percentage loss. */
  cplMean: number;
  ratingBefore: number;
  opponentRating: number;
  /** Wall-clock duration of the game in ms. */
  durationMs: number;
  playedAt: string;
}

export interface CollusionReport {
  boostingScore: number;
  sandbaggingScore: number;
  flags: string[];
  /** Opponent the player farmed with, when detected. */
  partnerId: string | null;
}

const MIN_GAMES = 6;

export function detectCollusion(games: GameRecord[]): CollusionReport {
  const flags: string[] = [];
  if (games.length < MIN_GAMES) {
    return { boostingScore: 0, sandbaggingScore: 0, flags: [], partnerId: null };
  }

  /* ------------------------------- boosting ------------------------------- */
  const byOpponent = new Map<string, GameRecord[]>();
  for (const g of games) {
    const list = byOpponent.get(g.opponentId) ?? [];
    list.push(g);
    byOpponent.set(g.opponentId, list);
  }

  let boosting = 0;
  let partnerId: string | null = null;
  for (const [opponentId, list] of byOpponent) {
    if (list.length < 3) continue;
    const share = list.length / games.length;
    const winRate = list.reduce((a, g) => a + g.score, 0) / list.length;
    const shortGames = list.filter((g) => g.moves <= 12 || g.durationMs <= 45_000).length / list.length;
    // A repeated opponent, a one-sided result stream and unnaturally short games.
    const s =
      Math.min(1, share / 0.5) * 0.4 +
      Math.max(0, winRate - 0.75) * 4 * 0.35 +
      shortGames * 0.25;
    const scaled = Math.round(Math.min(1, s) * 100);
    if (scaled > boosting) {
      boosting = scaled;
      partnerId = opponentId;
    }
  }
  if (boosting >= 60 && partnerId) flags.push("Lặp lại một đối thủ với kết quả một chiều");

  /* ------------------------------ sandbagging ----------------------------- */
  const losses = games.filter((g) => g.score === 0);
  const quickLosses = losses.filter((g) => g.moves <= 15 || g.durationMs <= 40_000);
  const badLossCpl =
    losses.length === 0 ? 0 : losses.reduce((a, g) => a + g.cplMean, 0) / losses.length;
  const goodWinCpl = (() => {
    const wins = games.filter((g) => g.score === 1);
    return wins.length === 0 ? 0 : wins.reduce((a, g) => a + g.cplMean, 0) / wins.length;
  })();
  const gap = badLossCpl - goodWinCpl;

  const sandbagging = Math.round(
    Math.min(
      100,
      (losses.length === 0 ? 0 : (quickLosses.length / losses.length) * 55) +
        Math.max(0, Math.min(45, gap * 6)),
    ),
  );
  if (sandbagging >= 60) flags.push("Thua nhanh có chủ đích, chất lượng nước sụt hẳn khi thua");

  return { boostingScore: boosting, sandbaggingScore: sandbagging, flags, partnerId };
}
