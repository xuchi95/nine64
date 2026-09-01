import { Chess } from "chess.js";
import type { BotLevel, BotPersonality } from "@/config/bots";
import type { EngineLine, EngineVariant } from "./stockfish";

/**
 * Personality engine — style layer, strictly separated from strength.
 *
 * Difficulty (BotLevel) owns search budget / Elo cap. Personality only decides
 * WHICH of several near-equal engine candidates gets played, and it may never
 * step outside the eval-loss budget for that level. Higher level = tighter
 * budget, so a Level 15 Viper is still a Level 15 engine — just the sharpest
 * of the top moves.
 */

export const PERSONALITY_STYLES = [
  "atlas",
  "viper",
  "fortress",
  "gambit",
  "nova",
  "oracle",
  "chaos",
] as const;
export type PersonalityStyle = (typeof PERSONALITY_STYLES)[number];

export function styleOf(personality: Pick<BotPersonality, "id">): PersonalityStyle {
  return (PERSONALITY_STYLES as readonly string[]).includes(personality.id)
    ? (personality.id as PersonalityStyle)
    : "atlas";
}

/** Personality is disabled at maximum-strength (cloud) levels. */
export function personalityActive(level: BotLevel, personality: Pick<BotPersonality, "id">): boolean {
  if (level.runtime === "cloud") return false;
  return styleOf(personality) !== "oracle";
}

/**
 * Eval-loss budget in centipawns. Scales the personality's own tolerance down
 * as level rises so style never turns into a blunder generator.
 */
export function toleranceFor(personality: BotPersonality, level: BotLevel): number {
  if (!personalityActive(level, personality)) return 0;
  const base = Math.max(0, personality.evalTolerance);
  const lv = level.level;
  const factor =
    lv <= 4 ? 1.15 : lv <= 8 ? 0.9 : lv <= 12 ? 0.55 : lv === 13 ? 0.3 : lv === 14 ? 0.22 : 0.15;
  const hardCap = lv <= 8 ? 120 : lv <= 12 ? 60 : lv === 13 ? 30 : lv === 14 ? 22 : 15;
  return Math.min(hardCap, Math.round(base * factor));
}

export function multiPvFor(personality: BotPersonality, level: BotLevel): number {
  if (!personalityActive(level, personality)) return 1;
  if (toleranceFor(personality, level) === 0) return 1;
  return level.level <= 12 ? 5 : 3;
}

const PIECE_VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

export interface MoveFeatures {
  capture: boolean;
  capturedValue: number;
  materialSwing: number;
  sacrifice: boolean;
  check: boolean;
  mate: boolean;
  promotion: boolean;
  forcing: boolean;
  kingDistance: number;
  ourMobility: number;
  theirMobility: number;
  simplification: number;
  pawnStructurePenalty: number;
  developing: boolean;
  san: string | null;
}

const NEUTRAL: MoveFeatures = {
  capture: false,
  capturedValue: 0,
  materialSwing: 0,
  sacrifice: false,
  check: false,
  mate: false,
  promotion: false,
  forcing: false,
  kingDistance: 4,
  ourMobility: 0,
  theirMobility: 0,
  simplification: 0,
  pawnStructurePenalty: 0,
  developing: false,
  san: null,
};

function materialOf(chess: Chess, color: "w" | "b"): number {
  let total = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.color === color) total += PIECE_VALUE[sq.type] ?? 0;
    }
  }
  return total;
}

function pawnPenalty(chess: Chess, color: "w" | "b"): number {
  const files = new Array(8).fill(0) as number[];
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.color === color && sq.type === "p") {
        files[sq.square.charCodeAt(0) - 97]! += 1;
      }
    }
  }
  let penalty = 0;
  files.forEach((count, i) => {
    if (count > 1) penalty += (count - 1) * 2;
    if (count > 0 && (files[i - 1] ?? 0) === 0 && (files[i + 1] ?? 0) === 0) penalty += 2;
  });
  return penalty;
}

function kingSquare(chess: Chess, color: "w" | "b"): string | null {
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.color === color && sq.type === "k") return sq.square;
    }
  }
  return null;
}

function squareDistance(a: string, b: string): number {
  return Math.max(
    Math.abs(a.charCodeAt(0) - b.charCodeAt(0)),
    Math.abs(a.charCodeAt(1) - b.charCodeAt(1)),
  );
}

/**
 * Derives style features for a UCI move. Returns neutral features when the
 * position cannot be modelled (e.g. Chess960 castling encodings) so the
 * reranker degrades to "play the engine's best move" instead of guessing.
 */
export function extractFeatures(fen: string, uci: string): MoveFeatures {
  try {
    const chess = new Chess(fen);
    const mover = chess.turn();
    const them = mover === "w" ? "b" : "w";
    const beforeUs = materialOf(chess, mover);
    const beforeThem = materialOf(chess, them);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    if (!move) return NEUTRAL;

    const afterUs = materialOf(chess, mover);
    const afterThem = materialOf(chess, them);
    const capturedValue = beforeThem - afterThem;
    const lost = beforeUs - afterUs;
    const check = chess.isCheck();
    const mate = chess.isCheckmate();
    const theirMobility = chess.moves().length;
    const enemyKing = kingSquare(chess, them);

    // our mobility from the same position with the side to move flipped back
    let ourMobility = 0;
    try {
      const flipped = new Chess(chess.fen().replace(/ (w|b) /, ` ${mover} `));
      ourMobility = flipped.moves().length;
    } catch {
      ourMobility = 0;
    }

    return {
      capture: Boolean(move.captured),
      capturedValue,
      materialSwing: capturedValue - lost,
      sacrifice: capturedValue - lost < 0,
      check,
      mate,
      promotion: Boolean(move.promotion),
      forcing: check || Boolean(move.captured) || Boolean(move.promotion),
      kingDistance: enemyKing ? squareDistance(move.to, enemyKing) : 4,
      ourMobility,
      theirMobility,
      simplification: (beforeUs + beforeThem) - (afterUs + afterThem),
      pawnStructurePenalty: pawnPenalty(chess, mover),
      developing: ["n", "b"].includes(move.piece) && /[18]/.test(move.from[1] ?? ""),
      san: move.san,
    };
  } catch {
    return NEUTRAL;
  }
}

export interface StyleContext {
  /** ply index of the move being played (0 = white's first move) */
  ply: number;
  variant: EngineVariant;
}

/** Style score in arbitrary units; higher = more in-character. */
export function styleScore(
  style: PersonalityStyle,
  f: MoveFeatures,
  personality: BotPersonality,
  ctx: StyleContext,
): number {
  if (f.mate) return 1000;
  let s = 0;
  const kingPressure = Math.max(0, 5 - f.kingDistance);
  const activity = f.ourMobility - f.theirMobility;

  switch (style) {
    case "viper":
      s += (f.check ? 26 : 0) + (f.forcing ? 10 : 0) + kingPressure * 7 + activity * 0.5;
      s += f.capture ? 6 : 0;
      break;
    case "fortress":
      s += f.check ? 2 : 0;
      s -= kingPressure * 2;
      s += f.simplification * 0.02;
      s -= f.pawnStructurePenalty * 6;
      s -= f.sacrifice ? 30 : 0;
      s -= f.theirMobility * 0.25;
      break;
    case "gambit":
      s += f.sacrifice ? 26 : 0;
      s += activity * 1.1 + kingPressure * 3 + (f.forcing ? 6 : 0);
      s -= f.simplification * 0.02;
      break;
    case "nova":
      s += activity * 1.2 + (f.capture && f.capturedValue !== 0 ? 4 : 0);
      s -= f.simplification * 0.03;
      s += f.promotion ? 8 : 0;
      break;
    case "chaos":
      s += kingPressure + activity * 0.2;
      break;
    case "atlas":
    default:
      s += activity * 0.6 - f.pawnStructurePenalty * 3;
      s += f.developing ? 6 : 0;
      s -= f.sacrifice ? 10 : 0;
      break;
  }

  // Opening book: a soft in-character bonus during the opening phase only,
  // applied to moves the engine already proposed (legal + inside tolerance).
  if (
    ctx.variant === "standard" &&
    ctx.ply < 8 &&
    f.san &&
    personality.openings.some((o) => o === f.san)
  ) {
    s += 18;
  }
  return s;
}

export function scoreOfLine(line: EngineLine): number {
  if (line.mateIn !== null) return line.mateIn > 0 ? 100000 - line.mateIn : -100000 - line.mateIn;
  return line.cp ?? 0;
}

/** Deterministic small PRNG so Chaos is reproducible from a seed. */
export function makeRng(seed: number): () => number {
  let s = (seed | 0) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export interface PickOptions {
  lines: EngineLine[];
  personality: BotPersonality;
  level: BotLevel;
  fen: string;
  ply?: number;
  variant?: EngineVariant;
  rng?: () => number;
}

/**
 * Personality reranker. Always returns a move inside the level's eval-loss
 * budget; Oracle and cloud levels always return the engine's best move.
 */
export function pickPersonalityMove(opts: PickOptions): string {
  const { lines, personality, level } = opts;
  if (lines.length === 0) return "";
  const best = lines[0]!;
  if (!personalityActive(level, personality)) return best.move;

  const tolerance = toleranceFor(personality, level);
  if (tolerance <= 0) return best.move;
  // Never trade away a forced mate for style.
  if (best.mateIn !== null && best.mateIn > 0) return best.move;

  const bestScore = scoreOfLine(best);
  const candidates = lines.filter((l) => bestScore - scoreOfLine(l) <= tolerance);
  if (candidates.length <= 1) return best.move;

  const style = styleOf(personality);
  const ctx: StyleContext = { ply: opts.ply ?? 0, variant: opts.variant ?? "standard" };
  const scored = candidates.map((l) => {
    const f = extractFeatures(opts.fen, l.move);
    const loss = bestScore - scoreOfLine(l);
    return { line: l, style: styleScore(style, f, personality, ctx), loss };
  });

  if (style === "chaos") {
    const rng = opts.rng ?? Math.random;
    // Weighted stochastic pick, still bounded by tolerance and biased away
    // from the worst candidates.
    const weights = scored.map((c) => Math.max(0.05, 1 + c.style / 20 - c.loss / (tolerance + 1)));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < scored.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return scored[i]!.line.move;
    }
    return best.move;
  }

  // Deterministic rerank: style score first, engine loss as tie-breaker.
  scored.sort((a, b) => b.style - a.style || a.loss - b.loss);
  return scored[0]!.line.move;
}
