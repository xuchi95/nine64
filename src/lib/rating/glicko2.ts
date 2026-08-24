/**
 * Glicko-2 rating system (Glickman, 2013).
 *
 * Ratings are stored in the familiar Elo-like scale (r, RD) and converted to
 * the internal Glicko-2 scale (mu, phi) for the update step.
 */

export interface Rating {
  /** Rating on the Elo-like scale. */
  rating: number;
  /** Rating deviation on the Elo-like scale. */
  rd: number;
  /** Rating volatility. */
  volatility: number;
}

export interface Opponent {
  rating: number;
  rd: number;
  /** 1 = win, 0.5 = draw, 0 = loss (from the rated player's perspective). */
  score: number;
}

export const GLICKO_SCALE = 173.7178;
export const DEFAULT_RATING: Rating = { rating: 1200, rd: 350, volatility: 0.06 };
/** System constant: constrains volatility change over time. */
export const TAU = 0.5;
const EPSILON = 1e-6;

export function isProvisional(rd: number): boolean {
  return rd > 110;
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function e(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Applies a rating period containing one or more games.
 * Passing a single opponent is the common online-chess case.
 */
export function glicko2Update(player: Rating, opponents: Opponent[], tau = TAU): Rating {
  const mu = (player.rating - DEFAULT_RATING.rating) / GLICKO_SCALE;
  const phi = player.rd / GLICKO_SCALE;
  const sigma = player.volatility;

  if (opponents.length === 0) {
    // No games: deviation grows toward the prior.
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return {
      rating: player.rating,
      rd: Math.min(DEFAULT_RATING.rd, phiStar * GLICKO_SCALE),
      volatility: sigma,
    };
  }

  let vInv = 0;
  let deltaSum = 0;
  for (const o of opponents) {
    const muJ = (o.rating - DEFAULT_RATING.rating) / GLICKO_SCALE;
    const phiJ = o.rd / GLICKO_SCALE;
    const gJ = g(phiJ);
    const eJ = e(mu, muJ, phiJ);
    vInv += gJ * gJ * eJ * (1 - eJ);
    deltaSum += gJ * (o.score - eJ);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // Illinois-variant regula falsi to solve for the new volatility.
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * Math.pow(phi * phi + v + ex, 2);
    return num / den - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0 && k < 100) k += 1;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  let guard = 0;
  while (Math.abs(B - A) > EPSILON && guard < 200) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
    guard += 1;
  }
  const sigmaPrime = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + vInv);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  return {
    rating: Math.round((muPrime * GLICKO_SCALE + DEFAULT_RATING.rating) * 100) / 100,
    rd: Math.round(Math.min(DEFAULT_RATING.rd, phiPrime * GLICKO_SCALE) * 100) / 100,
    volatility: Math.round(sigmaPrime * 1e6) / 1e6,
  };
}

/** Expected score of `a` against `b` under Glicko-2. */
export function expectedScore(a: Rating, b: Rating): number {
  const mu = (a.rating - DEFAULT_RATING.rating) / GLICKO_SCALE;
  const muJ = (b.rating - DEFAULT_RATING.rating) / GLICKO_SCALE;
  const phiJ = b.rd / GLICKO_SCALE;
  return e(mu, muJ, phiJ);
}

export function formatRating(rating: number, rd: number): string {
  return `${Math.round(rating)} ±${Math.round(rd)}${isProvisional(rd) ? "?" : ""}`;
}
