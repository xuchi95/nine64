/**
 * Population expectations.
 *
 * Every raw signal is meaningless on its own: a 2300 player legitimately matches
 * the engine far more often than a 900 player. We therefore convert each signal
 * into a z-score against the expectation for the player's own rating band, so the
 * model measures "how far outside your own band are you" instead of raw strength.
 */

export interface Band {
  mean: number;
  sd: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Rating-dependent expectations (rating in Glicko/Elo points). */
export function expectations(rating: number) {
  const r = clamp(rating, 600, 2800);
  const d = r - 800;
  return {
    /** Top-1 engine agreement over all own moves. */
    engineMatch: { mean: clamp(0.28 + 0.000135 * d, 0.25, 0.64), sd: 0.09 } as Band,
    /** Top-1 agreement restricted to complex positions — the discriminating signal. */
    hardMatch: { mean: clamp(0.16 + 0.00014 * d, 0.14, 0.52), sd: 0.1 } as Band,
    /** Mean accuracy on complex positions (0-100). */
    hardAccuracy: { mean: clamp(55 + 0.0112 * d, 55, 86), sd: 9.5 } as Band,
    /** Average win-percentage loss per move — lower is stronger. */
    cplMean: { mean: clamp(9 - 0.0029 * d, 2.1, 9), sd: 2.4 } as Band,
  };
}

/** Rating-independent behavioural baselines measured on honest play. */
export const BEHAVIOUR: Record<string, Band> = {
  /** Coefficient of variation of win% loss per move. Engines are flat. */
  cplCv: { mean: 1.35, sd: 0.33 },
  /** Coefficient of variation of thinking time. Assistance makes it constant. */
  timeCv: { mean: 0.72, sd: 0.2 },
  /** Share of complex moves played faster than the player's own median. */
  hardFastShare: { mean: 0.42, sd: 0.14 },
  /** Share of own turns with a meaningful focus loss. */
  blurShare: { mean: 0.07, sd: 0.09 },
  /** Engine agreement on blurred turns minus agreement on focused turns. */
  blurMatchLift: { mean: 0.0, sd: 0.09 },
  /** Share of moves where the first interaction already hit the destination. */
  noHesitationShare: { mean: 0.36, sd: 0.13 },
};


export function zScore(value: number, band: Band): number {
  if (band.sd <= 0) return 0;
  return (value - band.mean) / band.sd;
}
