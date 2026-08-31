/**
 * Concrete rule engines for every VariantKit variant.
 *
 * Kept out of `index.ts` so the registry stays a pure lookup table and the
 * engine construction (which starting arrays, which chessops rules) lives in
 * one auditable place.
 */

import { createChessopsRules, stripCastlingFromFen } from "./ChessopsRules";
import { STANDARD_FEN } from "./StandardRules";

export const ThreeCheckRules = createChessopsRules({
  rules: "3check",
  pgnVariantTag: "Three-check",
});

export const KingOfTheHillRules = createChessopsRules({
  rules: "kingofthehill",
  pgnVariantTag: "King of the Hill",
});

export const CrazyhouseRules = createChessopsRules({
  rules: "crazyhouse",
  pgnVariantTag: "Crazyhouse",
  hasPockets: true,
});

export const AtomicRules = createChessopsRules({
  rules: "atomic",
  pgnVariantTag: "Atomic",
});

export const HordeRules = createChessopsRules({
  rules: "horde",
  pgnVariantTag: "Horde",
});

export const RacingKingsRules = createChessopsRules({
  rules: "racingkings",
  pgnVariantTag: "Racing Kings",
});

export const GiveawayRules = createChessopsRules({
  rules: "antichess",
  pgnVariantTag: "Giveaway",
});

/** No Castling = classical rules with the castling rights permanently cleared. */
export const NoCastlingRules = createChessopsRules({
  rules: "chess",
  pgnVariantTag: "No Castling",
  startingFen: stripCastlingFromFen(STANDARD_FEN),
  stripCastling: true,
});

/** Nine64 custom: classical rules, both queens removed from the array. */
export const NoQueenRules = createChessopsRules({
  rules: "chess",
  pgnVariantTag: "No Queen",
  startingFen: "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1",
});
