import type { VariantId } from "@/config/variants";
import type { ChessRulesAdapter } from "./ChessRulesAdapter";
import { StandardRules } from "./StandardRules";
import { Chess960Rules } from "./Chess960Rules";

export * from "./ChessRulesAdapter";
export { StandardRules, STANDARD_FEN } from "./StandardRules";
export { Chess960Rules, CHESS960_UNSUPPORTED_REASON } from "./Chess960Rules";

/**
 * Rule engine per variant. Variants that only change the *objective* (three
 * check, king of the hill) or the *material* (no queen) keep classical move
 * rules and therefore use the standard engine; only shuffled back ranks need
 * a Chess960-capable engine.
 */
const REGISTRY: Record<VariantId, ChessRulesAdapter> = {
  standard: StandardRules,
  "three-check": StandardRules,
  "king-of-the-hill": StandardRules,
  "no-queen": StandardRules,
  chess960: Chess960Rules,
  "random-army": Chess960Rules,
};

export function rulesFor(variant: VariantId): ChessRulesAdapter {
  return REGISTRY[variant] ?? StandardRules;
}

export function rulesSupported(variant: VariantId): boolean {
  return rulesFor(variant).supported;
}
