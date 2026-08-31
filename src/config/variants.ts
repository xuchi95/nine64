/**
 * Nine64 VariantKit — the single source of truth for what a variant is and
 * where it may be offered.
 *
 * A surface (local board, bot, online matchmaking, engine analysis, rating)
 * may only offer a variant when the matching capability flag is true. No UI
 * derives availability from anything else, and no flag is enabled before the
 * implementation behind it exists.
 */

export type VariantId =
  | "standard"
  | "chess960"
  | "three-check"
  | "king-of-the-hill"
  | "crazyhouse"
  | "atomic"
  | "horde"
  | "racing-kings"
  | "giveaway"
  | "no-castling"
  | "no-queen"
  | "random-army";

/** Which rule engine owns move legality for a variant. */
export type RulesEngineKey = "standard" | "chess960" | "chessops";

/** Key into the terminal-condition registry (src/lib/chess/variantResult.ts). */
export type ResultResolverKey =
  | "standard"
  | "three-check"
  | "king-of-the-hill"
  | "racing-kings"
  | "atomic"
  | "horde"
  | "giveaway"
  | "crazyhouse";

/** How a game of this variant starts. */
export type StartingPosition =
  | { kind: "fixed"; fen: string }
  | { kind: "generated"; generator: "chess960" };

export interface VariantCapability {
  id: VariantId;
  name: string;
  blurb: string;
  /** Standard variant family (Lichess-compatible) vs. a Nine64 invention. */
  custom: boolean;

  // ---- required VariantKit metadata --------------------------------------
  rulesEngine: RulesEngineKey;
  /** Playable against the built-in bots (needs a bot that knows the rules). */
  botSupport: boolean;
  /** Engine evaluation is meaningful — never show a fake eval when false. */
  engineAnalysisSupport: boolean;
  /** Playable online (needs server-side rule validation + adjudication). */
  onlineSupport: boolean;
  /** Contributes to a rating pool. */
  ratedSupport: boolean;
  startingPosition: StartingPosition;
  resultResolver: ResultResolverKey;

  /** Hot-seat / offline board. */
  localPlayable: boolean;
  /** Separate rating pool identifier when ranked play is enabled. */
  ratingPool: string;
  /** Human-readable reason when the variant is disabled everywhere. */
  disabledReason?: string;
  /** Why engine analysis is off, when it is. */
  analysisDisabledReason?: string;
}

export type VariantMeta = VariantCapability & {
  /** Playable anywhere in this build. Derived from the capability flags. */
  enabled: boolean;
  // Legacy aliases kept so existing surfaces keep compiling.
  botPlayable: boolean;
  onlinePlayable: boolean;
  analysable: boolean;
  rated: boolean;
};

const RANDOM_ARMY_DISABLED_REASON =
  "Random Army has no specified army-balancing rules yet — it stays disabled instead of shipping an undefined variant.";

/** Chess960 gameplay is live; engine review is not (see AA audit). */
export const CHESS960_ANALYSIS_DISABLED_REASON =
  "Engine review for Chess960 is still gated: the analysis pipeline reconstructs positions with chess.js and cannot decode Chess960 castling in PV lines.";

const NO_VARIANT_ENGINE_REASON =
  "Stockfish builds shipped by Nine64 only understand classical rules — this variant would produce a fake evaluation, so analysis stays off until a variant-aware engine is wired in.";

const NO_VARIANT_BOT_REASON =
  "The bot pipeline plays classical moves only; it cannot legally play this variant yet.";

const STD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function fixed(fen: string): StartingPosition {
  return { kind: "fixed", fen };
}

const CAPABILITIES: VariantCapability[] = [
  {
    id: "standard",
    name: "Standard",
    blurb: "Classical chess, full FIDE rule set.",
    custom: false,
    rulesEngine: "standard",
    botSupport: true,
    engineAnalysisSupport: true,
    onlineSupport: true,
    ratedSupport: true,
    startingPosition: fixed(STD_FEN),
    resultResolver: "standard",
    localPlayable: true,
    ratingPool: "standard",
  },
  {
    id: "chess960",
    name: "Chess960",
    blurb: "Randomised back rank with legal Chess960 castling.",
    custom: false,
    rulesEngine: "chess960",
    botSupport: true,
    engineAnalysisSupport: false,
    onlineSupport: true,
    ratedSupport: true,
    startingPosition: { kind: "generated", generator: "chess960" },
    resultResolver: "standard",
    localPlayable: true,
    ratingPool: "chess960",
    analysisDisabledReason: CHESS960_ANALYSIS_DISABLED_REASON,
  },
  {
    id: "three-check",
    name: "Three-Check",
    blurb: "Deliver three checks to win the game.",
    custom: false,
    rulesEngine: "chessops",
    botSupport: true,
    engineAnalysisSupport: false,
    onlineSupport: false,
    ratedSupport: false,
    startingPosition: fixed(STD_FEN),
    resultResolver: "three-check",
    localPlayable: true,
    ratingPool: "three-check",
    analysisDisabledReason: NO_VARIANT_ENGINE_REASON,
  },
  {
    id: "king-of-the-hill",
    name: "King of the Hill",
    blurb: "March your king to a central square to win.",
    custom: false,
    rulesEngine: "chessops",
    botSupport: true,
    engineAnalysisSupport: false,
    onlineSupport: false,
    ratedSupport: false,
    startingPosition: fixed(STD_FEN),
    resultResolver: "king-of-the-hill",
    localPlayable: true,
    ratingPool: "king-of-the-hill",
    analysisDisabledReason: NO_VARIANT_ENGINE_REASON,
  },
  {
    id: "crazyhouse",
    name: "Crazyhouse",
    blurb: "Captured pieces change sides and can be dropped back on the board.",
    custom: false,
    rulesEngine: "chessops",
    botSupport: false,
    engineAnalysisSupport: false,
    onlineSupport: false,
    ratedSupport: false,
    startingPosition: fixed(STD_FEN),
    resultResolver: "crazyhouse",
    localPlayable: true,
    ratingPool: "crazyhouse",
    analysisDisabledReason: NO_VARIANT_ENGINE_REASON,
    disabledReason: NO_VARIANT_BOT_REASON,
  },
  {
    id: "atomic",
    name: "Atomic",
    blurb: "Every capture explodes; blow up the enemy king to win.",
    custom: false,
    rulesEngine: "chessops",
    botSupport: false,
    engineAnalysisSupport: false,
    onlineSupport: false,
    ratedSupport: false,
    startingPosition: fixed(STD_FEN),
    resultResolver: "atomic",
    localPlayable: true,
    ratingPool: "atomic",
    analysisDisabledReason: NO_VARIANT_ENGINE_REASON,
    disabledReason: NO_VARIANT_BOT_REASON,
  },
  {
    id: "horde",
    name: "Horde",
    blurb: "White fields a pawn horde; Black must capture every last pawn.",
    custom: false,
    rulesEngine: "chessops",
    botSupport: false,
    engineAnalysisSupport: false,
    onlineSupport: false,
    ratedSupport: false,
    startingPosition: fixed(
      "rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP w kq - 0 1",
    ),
    resultResolver: "horde",
    localPlayable: true,
    ratingPool: "horde",
    analysisDisabledReason: NO_VARIANT_ENGINE_REASON,
    disabledReason: NO_VARIANT_BOT_REASON,
  },
  {
    id: "racing-kings",
    name: "Racing Kings",
    blurb: "No checks allowed — race your king to the eighth rank.",
    custom: false,
    rulesEngine: "chessops",
    botSupport: false,
    engineAnalysisSupport: false,
    onlineSupport: false,
    ratedSupport: false,
    startingPosition: fixed("8/8/8/8/8/8/krbnNBRK/qrbnNBRQ w - - 0 1"),
    resultResolver: "racing-kings",
    localPlayable: true,
    ratingPool: "racing-kings",
    analysisDisabledReason: NO_VARIANT_ENGINE_REASON,
    disabledReason: NO_VARIANT_BOT_REASON,
  },
  {
    id: "giveaway",
    name: "Giveaway",
    blurb: "Captures are compulsory — lose all your pieces to win.",
    custom: false,
    rulesEngine: "chessops",
    botSupport: false,
    engineAnalysisSupport: false,
    onlineSupport: false,
    ratedSupport: false,
    startingPosition: fixed("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1"),
    resultResolver: "giveaway",
    localPlayable: true,
    ratingPool: "giveaway",
    analysisDisabledReason: NO_VARIANT_ENGINE_REASON,
    disabledReason: NO_VARIANT_BOT_REASON,
  },
  {
    id: "no-castling",
    name: "No Castling",
    blurb: "Classical chess with castling removed for both sides.",
    custom: false,
    rulesEngine: "chessops",
    botSupport: true,
    engineAnalysisSupport: false,
    onlineSupport: false,
    ratedSupport: false,
    startingPosition: fixed("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1"),
    resultResolver: "standard",
    localPlayable: true,
    ratingPool: "no-castling",
    analysisDisabledReason: NO_VARIANT_ENGINE_REASON,
  },
  {
    id: "no-queen",
    name: "No Queen",
    blurb: "Standard rules, both queens removed from the start.",
    custom: true,
    rulesEngine: "chessops",
    botSupport: true,
    engineAnalysisSupport: true,
    onlineSupport: false,
    ratedSupport: false,
    startingPosition: fixed("rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1"),
    resultResolver: "standard",
    localPlayable: true,
    ratingPool: "no-queen",
  },
  {
    id: "random-army",
    name: "Random Army",
    blurb: "Balanced random back rank, mirrored for both sides.",
    custom: true,
    rulesEngine: "chess960",
    botSupport: false,
    engineAnalysisSupport: false,
    onlineSupport: false,
    ratedSupport: false,
    startingPosition: { kind: "generated", generator: "chess960" },
    resultResolver: "standard",
    localPlayable: false,
    ratingPool: "random-army",
    disabledReason: RANDOM_ARMY_DISABLED_REASON,
  },
];

export const VARIANT_CAPABILITIES: Record<VariantId, VariantMeta> = Object.fromEntries(
  CAPABILITIES.map((c) => [
    c.id,
    {
      ...c,
      botPlayable: c.botSupport,
      onlinePlayable: c.onlineSupport,
      analysable: c.engineAnalysisSupport,
      rated: c.ratedSupport,
      enabled: c.localPlayable || c.botSupport || c.onlineSupport,
    },
  ]),
) as Record<VariantId, VariantMeta>;

export const VARIANTS: VariantMeta[] = CAPABILITIES.map((c) => VARIANT_CAPABILITIES[c.id]!);

export function getVariant(id: VariantId): VariantMeta {
  return VARIANT_CAPABILITIES[id] ?? VARIANT_CAPABILITIES.standard;
}

export function localVariants(): VariantMeta[] {
  return VARIANTS.filter((v) => v.localPlayable);
}

export function botVariants(): VariantMeta[] {
  return VARIANTS.filter((v) => v.botSupport);
}

export function onlineVariants(): VariantMeta[] {
  return VARIANTS.filter((v) => v.onlineSupport);
}

export function analysableVariants(): VariantMeta[] {
  return VARIANTS.filter((v) => v.engineAnalysisSupport);
}

export function isOnlinePlayable(id: string): id is VariantId {
  const meta = VARIANT_CAPABILITIES[id as VariantId];
  return !!meta && meta.onlineSupport;
}

/** True when an engine evaluation may be displayed for this variant. */
export function isAnalysable(id: string): boolean {
  return Boolean(VARIANT_CAPABILITIES[id as VariantId]?.engineAnalysisSupport);
}

/** Variants that use a piece pocket (crazyhouse family). */
export function hasPocket(id: VariantId): boolean {
  return id === "crazyhouse";
}

import { translate } from "@/lib/i18n";

export function variantName(id: VariantId): string {
  const key = `play.variants.${id}.name`;
  const translated = translate(key);
  return translated === key ? (VARIANT_CAPABILITIES[id]?.name ?? id) : translated;
}

export function variantBlurb(id: VariantId): string {
  const key = `play.variants.${id}.blurb`;
  const translated = translate(key);
  return translated === key ? (VARIANT_CAPABILITIES[id]?.blurb ?? "") : translated;
}
