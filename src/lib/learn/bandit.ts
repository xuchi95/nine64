/**
 * UCB1 multi-armed bandit used to pick the bot (level + personality) that keeps
 * the player's win rate near 50% while attacking their weakest phases.
 */

export interface ArmStats {
  id: string;
  pulls: number;
  /** Sum of rewards in [0,1]. */
  reward: number;
}

export interface ArmChoice<T> {
  arm: T;
  score: number;
}

/** Reward is highest when the match was close to a coin flip. */
export function closenessReward(playerScore: number): number {
  // playerScore: 1 win, 0.5 draw, 0 loss → reward peaks at 0.5.
  return 1 - Math.abs(playerScore - 0.5) * 2 * 0.8;
}

export function ucb1<T extends { id: string }>(
  arms: T[],
  stats: Record<string, ArmStats | undefined>,
  opts: { bias?: (arm: T) => number; c?: number } = {},
): ArmChoice<T>[] {
  const c = opts.c ?? Math.SQRT2;
  const totalPulls = arms.reduce((a, arm) => a + (stats[arm.id]?.pulls ?? 0), 0);
  const scored = arms.map((arm) => {
    const s = stats[arm.id];
    const bias = opts.bias?.(arm) ?? 0;
    if (!s || s.pulls === 0) {
      // Unexplored arms get priority, ordered by prior bias.
      return { arm, score: Number.POSITIVE_INFINITY - 1 + bias / 1000 };
    }
    const mean = s.reward / s.pulls;
    const explore = c * Math.sqrt(Math.log(Math.max(2, totalPulls)) / s.pulls);
    return { arm, score: mean + explore + bias };
  });
  return scored.sort((a, b) => b.score - a.score);
}

export function recordPull(
  stats: Record<string, ArmStats | undefined>,
  id: string,
  reward: number,
): Record<string, ArmStats> {
  const prev = stats[id] ?? { id, pulls: 0, reward: 0 };
  return {
    ...(stats as Record<string, ArmStats>),
    [id]: { id, pulls: prev.pulls + 1, reward: prev.reward + reward },
  };
}
