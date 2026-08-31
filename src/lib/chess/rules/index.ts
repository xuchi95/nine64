import type { VariantId } from "@/config/variants";
import type { ChessRulesAdapter } from "./ChessRulesAdapter";
import { StandardRules } from "./StandardRules";
import { Chess960Rules } from "./Chess960Rules";
import {
  AtomicRules,
  CrazyhouseRules,
  GiveawayRules,
  HordeRules,
  KingOfTheHillRules,
  NoCastlingRules,
  NoQueenRules,
  RacingKingsRules,
  ThreeCheckRules,
} from "./variantEngines";

export * from "./ChessRulesAdapter";
export * from "./chess960MoveCodec";
export { StandardRules, STANDARD_FEN } from "./StandardRules";
export { Chess960Rules, canonicalChess960Fen } from "./Chess960Rules";
export { createChessopsRules, stripCastlingFromFen } from "./ChessopsRules";
export * from "./variantEngines";

/**
 * Rule engine per variant. Nothing outside this table decides which engine a
 * variant uses, and no React component ever implements variant rules itself.
 */
const REGISTRY: Record<VariantId, ChessRulesAdapter> = {
  standard: StandardRules,
  chess960: Chess960Rules,
  "three-check": ThreeCheckRules,
  "king-of-the-hill": KingOfTheHillRules,
  crazyhouse: CrazyhouseRules,
  atomic: AtomicRules,
  horde: HordeRules,
  "racing-kings": RacingKingsRules,
  giveaway: GiveawayRules,
  "no-castling": NoCastlingRules,
  "no-queen": NoQueenRules,
  "random-army": Chess960Rules,
};

export function rulesFor(variant: VariantId): ChessRulesAdapter {
  return REGISTRY[variant] ?? StandardRules;
}

export function rulesSupported(variant: VariantId): boolean {
  return rulesFor(variant).supported;
}
