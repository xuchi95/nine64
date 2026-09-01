/**
 * Which variants Nine64 Titan (level 16, cloud Stockfish) can actually play.
 *
 * Titan runs a standard Stockfish build with UCI_Chess960 support. It has no
 * understanding of three-check, king-of-the-hill or the Nine64 custom rules,
 * so those variants are hard-blocked here rather than being silently
 * downgraded to standard chess. A variant is only added to this list once the
 * whole rules/FEN/engine pipeline has been verified end to end.
 */
import type { VariantId } from "@/config/variants";

export const TITAN_VARIANTS = ["standard", "chess960"] as const;

export type TitanVariant = (typeof TITAN_VARIANTS)[number];

export function isTitanVariant(id: string): id is TitanVariant {
  return (TITAN_VARIANTS as readonly string[]).includes(id);
}

/**
 * Stable reason code for an unsupported Titan variant, or null when supported.
 * `ENGINE_RULES_UNSUPPORTED` — Stockfish does not implement these rules.
 * `ENGINE_UNVERIFIED` — rules exist but the cloud pipeline is not verified yet.
 */
export function titanVariantBlockCode(id: VariantId | string): string | null {
  if (isTitanVariant(id)) return null;
  return id === "no-castling" || id === "no-queen" ? "ENGINE_UNVERIFIED" : "ENGINE_RULES_UNSUPPORTED";
}

/** True when level 16 may be started with this variant. */
export function titanSupportsVariant(id: VariantId | string): boolean {
  return isTitanVariant(id);
}
