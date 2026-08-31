export type VariantId =
  | "standard"
  | "chess960"
  | "three-check"
  | "king-of-the-hill"
  | "no-queen"
  | "random-army";

export type RulesEngineKey = "standard" | "chess960";

/**
 * Single source of truth for what a variant may actually be used for.
 *
 * A surface (local board, bot, online matchmaking, analysis, rating) may only
 * offer a variant when the matching capability flag is true. No UI may derive
 * availability from anything else.
 */
export interface VariantCapability {
  id: VariantId;
  name: string;
  blurb: string;
  /** Hot-seat / offline board. */
  localPlayable: boolean;
  /** Playable against the built-in bots. */
  botPlayable: boolean;
  /** Playable online — requires server-side rule validation for the variant. */
  onlinePlayable: boolean;
  /** Engine review / analysis board support. */
  analysable: boolean;
  /** Contributes to a rating pool. */
  rated: boolean;
  /** Rule engine that owns move legality for this variant. */
  rulesEngine: RulesEngineKey;
  /** Separate rating pool identifier when ranked play is enabled. */
  ratingPool: string;
  /** Human-readable reason when the variant is disabled everywhere. */
  disabledReason?: string;
}

export type VariantMeta = VariantCapability & {
  /** Playable anywhere in this build. Derived from the capability flags. */
  enabled: boolean;
};

const RANDOM_ARMY_DISABLED_REASON =
  "Random Army has no specified army-balancing rules yet — it stays disabled instead of shipping an undefined variant.";

/** Chess960 gameplay is live; engine review is not (see AA audit). */
export const CHESS960_ANALYSIS_DISABLED_REASON =
  "Engine review for Chess960 is still gated: the analysis pipeline reconstructs positions with chess.js and cannot decode Chess960 castling in PV lines.";

const CAPABILITIES: VariantCapability[] = [
  {
    id: "standard",
    name: "Standard",
    blurb: "Classical chess, full FIDE rule set.",
    localPlayable: true,
    botPlayable: true,
    onlinePlayable: true,
    analysable: true,
    rated: true,
    rulesEngine: "standard",
    ratingPool: "standard",
  },
  {
    id: "three-check",
    name: "Three-Check",
    blurb: "Deliver three checks to win the game.",
    localPlayable: true,
    botPlayable: true,
    onlinePlayable: false,
    analysable: true,
    rated: false,
    rulesEngine: "standard",
    ratingPool: "three-check",
  },
  {
    id: "king-of-the-hill",
    name: "King of the Hill",
    blurb: "March your king to a central square to win.",
    localPlayable: true,
    botPlayable: true,
    onlinePlayable: false,
    analysable: true,
    rated: false,
    rulesEngine: "standard",
    ratingPool: "king-of-the-hill",
  },
  {
    id: "no-queen",
    name: "No Queen",
    blurb: "Standard rules, both queens removed from the start.",
    localPlayable: true,
    botPlayable: true,
    onlinePlayable: false,
    analysable: true,
    rated: false,
    rulesEngine: "standard",
    ratingPool: "no-queen",
  },
  {
    id: "chess960",
    name: "Chess960",
    blurb: "Randomised back rank with legal Chess960 castling.",
    localPlayable: true,
    botPlayable: true,
    onlinePlayable: true,
    analysable: false,
    rated: true,
    rulesEngine: "chess960",
    ratingPool: "chess960",
  },
  {
    id: "random-army",
    name: "Random Army",
    blurb: "Balanced random back rank, mirrored for both sides.",
    localPlayable: false,
    botPlayable: false,
    onlinePlayable: false,
    analysable: false,
    rated: false,
    rulesEngine: "chess960",
    ratingPool: "random-army",
    disabledReason: RANDOM_ARMY_DISABLED_REASON,
  },
];

export const VARIANT_CAPABILITIES: Record<VariantId, VariantMeta> = Object.fromEntries(
  CAPABILITIES.map((c) => [
    c.id,
    {
      ...c,
      enabled: c.localPlayable || c.botPlayable || c.onlinePlayable,
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
  return VARIANTS.filter((v) => v.botPlayable);
}

export function onlineVariants(): VariantMeta[] {
  return VARIANTS.filter((v) => v.onlinePlayable);
}

export function isOnlinePlayable(id: string): id is VariantId {
  const meta = VARIANT_CAPABILITIES[id as VariantId];
  return !!meta && meta.onlinePlayable;
}

import { translate } from "@/lib/i18n";

export function variantName(id: VariantId): string {
  return translate(`play.variants.${id}.name`);
}

export function variantBlurb(id: VariantId): string {
  return translate(`play.variants.${id}.blurb`);
}
