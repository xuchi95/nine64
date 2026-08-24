export type VariantId =
  | "standard"
  | "chess960"
  | "three-check"
  | "king-of-the-hill"
  | "no-queen"
  | "random-army";

export interface VariantMeta {
  id: VariantId;
  name: string;
  blurb: string;
  /** Playable today in this build (rule engine implemented). */
  enabled: boolean;
  /** Separate rating pool when ranked play is enabled. */
  ratingPool: string;
}

/**
 * Variant registry. Each playable variant is implemented by a rule engine in
 * src/lib/chess/variants — the board component never special-cases a variant.
 */
export const VARIANTS: VariantMeta[] = [
  {
    id: "standard",
    name: "Standard",
    blurb: "Classical chess, full FIDE rule set.",
    enabled: true,
    ratingPool: "standard",
  },
  {
    id: "chess960",
    name: "Chess960",
    blurb: "Randomised back rank with legal Chess960 castling.",
    enabled: true,
    ratingPool: "chess960",
  },
  {
    id: "three-check",
    name: "Three-Check",
    blurb: "Deliver three checks to win the game.",
    enabled: true,
    ratingPool: "three-check",
  },
  {
    id: "king-of-the-hill",
    name: "King of the Hill",
    blurb: "March your king to a central square to win.",
    enabled: true,
    ratingPool: "king-of-the-hill",
  },
  {
    id: "no-queen",
    name: "No Queen",
    blurb: "Standard rules, both queens removed from the start.",
    enabled: true,
    ratingPool: "no-queen",
  },
  {
    id: "random-army",
    name: "Random Army",
    blurb: "Balanced random back rank, mirrored for both sides.",
    enabled: true,
    ratingPool: "random-army",
  },
];

export function getVariant(id: VariantId): VariantMeta {
  return VARIANTS.find((v) => v.id === id) ?? VARIANTS[0];
}
