import { VARIANT_CAPABILITIES, type ResultResolverKey, type VariantId } from "@/config/variants";
import { rulesFor } from "@/lib/chess/rules";
import type { BoardPiece, PieceColor } from "@/lib/chess/rules/ChessRulesAdapter";

export interface VariantResult {
  over: boolean;
  winner?: "w" | "b" | "draw";
  reason?: string;
}

/**
 * Minimal, rule-engine-neutral view a variant objective needs.
 *
 * `variantOutcome` / `checkCount` are optional because only the chessops-backed
 * engines expose them; resolvers must feature-detect rather than assume.
 */
export interface VariantPositionView {
  boardPieces(): BoardPiece[];
  variantOutcome?(): { over: boolean; winner?: PieceColor | "draw"; reason?: string } | null;
  checkCount?(): { w: number; b: number };
}

export interface VariantRules {
  id: VariantId;
  /** Starting FEN for a new game. */
  startingFen: () => string;
  /**
   * Variant-specific terminal check, evaluated after each move.
   * Standard rules (mate/stalemate/etc.) are always checked separately.
   */
  checkResult: (position: VariantPositionView, history: string[]) => VariantResult;
  /** Chess960-style castling handling required. */
  chess960: boolean;
}

const NONE: VariantResult = { over: false };

const STANDARD_BACK = "rnbqkbnr";

export const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Every variant objective is decided by the rules engine itself
 * (`position.variantOutcome()`), never by parsing SAN strings. The resolver
 * only translates the engine verdict into a Nine64 reason string.
 */
function engineOutcome(position: VariantPositionView, reason: string): VariantResult {
  const outcome = position.variantOutcome?.();
  if (!outcome?.over) return NONE;
  return { over: true, winner: outcome.winner ?? "draw", reason };
}

const RESOLVERS: Record<
  ResultResolverKey,
  (position: VariantPositionView, history: string[]) => VariantResult
> = {
  standard: () => NONE,
  crazyhouse: () => NONE,
  "three-check": (position) => engineOutcome(position, "Three checks delivered"),
  "king-of-the-hill": (position) => engineOutcome(position, "King reached the hill"),
  "racing-kings": (position) => engineOutcome(position, "King reached the eighth rank"),
  atomic: (position) => engineOutcome(position, "King exploded"),
  horde: (position) => engineOutcome(position, "Horde destroyed"),
  giveaway: (position) => engineOutcome(position, "All pieces given away"),
};

/** Canonical three-check counter, read from position state (never from SAN). */
export function checkCounters(position: VariantPositionView): { w: number; b: number } {
  return position.checkCount?.() ?? { w: 0, b: 0 };
}

function build(id: VariantId): VariantRules {
  const meta = VARIANT_CAPABILITIES[id];
  return {
    id,
    startingFen: () => rulesFor(id).startingFen(),
    checkResult: RESOLVERS[meta.resultResolver],
    chess960: meta.rulesEngine === "chess960",
  };
}

export const VARIANT_RULES: Record<VariantId, VariantRules> = Object.fromEntries(
  (Object.keys(VARIANT_CAPABILITIES) as VariantId[]).map((id) => [id, build(id)]),
) as Record<VariantId, VariantRules>;

export { STANDARD_BACK };
