/**
 * Position facts for the Live Play Coach.
 *
 * Everything here is derived from the rules engine (legal moves, captures,
 * defenders). The AI layer never computes or invents any of it.
 */
import { rulesFor } from "@/lib/chess/rules";
import type { RulesPosition } from "@/lib/chess/rules/ChessRulesAdapter";
import type { VariantId } from "@/config/variants";
import type { MoveFacts, OpeningIssue, StrategicIssue } from "./types";

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Converts an engine UCI move to SAN using the rules engine, or null. */
export function sanForUci(position: RulesPosition, uci: string | null): string | null {
  if (!uci || uci.length < 4) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? (uci[4] as "q" | "r" | "b" | "n") : undefined;
  const probe = position.clone();
  const applied = probe.move(from, to, promotion);
  return applied ? applied.san : null;
}

/** True when the engine's top move captures something or forces mate. */
export function bestIsTactic(
  position: RulesPosition,
  bestUci: string | null,
  mateBefore: number | null,
): boolean {
  if (mateBefore !== null && mateBefore > 0) return true;
  if (!bestUci) return false;
  const probe = position.clone();
  const applied = probe.move(bestUci.slice(0, 2), bestUci.slice(2, 4));
  return !!applied?.captured;
}

/**
 * Most valuable own piece the opponent can win on the spot.
 *
 * A capture counts as winning material when the piece is undefended, or when
 * the victim is worth clearly more than the capturer (a rules-engine check, not
 * a heuristic guess).
 */
export function findHangingPiece(
  afterFen: string,
  variant: VariantId,
  userColor: "w" | "b",
): { square: string; piece: string } | null {
  const adapter = rulesFor(variant);
  let position: RulesPosition;
  try {
    position = adapter.createPosition(afterFen);
  } catch {
    return null;
  }
  // Only meaningful when the opponent is to move.
  if (position.turn() === userColor) return null;

  let bestLoss = 0;
  let found: { square: string; piece: string } | null = null;

  for (const move of position.legalMoves()) {
    const victim = position.pieceAt(move.to);
    if (!victim || victim.color !== userColor) continue;
    const attacker = position.pieceAt(move.from);
    if (!attacker) continue;
    const victimValue = VALUE[victim.type] ?? 0;
    if (victimValue < 3) continue;

    const after = position.clone();
    const applied = after.move(move.from, move.to, "q");
    if (!applied) continue;
    // Is there a recapture on that square?
    const recapture = after.legalMoves().some((m) => m.to === move.to);
    const attackerValue = VALUE[attacker.type] ?? 0;
    const loss = recapture ? victimValue - attackerValue : victimValue;
    if (loss > bestLoss) {
      bestLoss = loss;
      found = { square: move.to, piece: victim.type };
    }
  }
  return bestLoss >= 2 ? found : null;
}

interface OpeningInput {
  history: { san: string; from: string; to: string; color: "w" | "b" }[];
  userColor: "w" | "b";
  plyIndex: number;
}

/** Opening-principle check, limited to the first 20 plies. */
export function detectOpeningIssue({
  history,
  userColor,
  plyIndex,
}: OpeningInput): OpeningIssue | null {
  if (plyIndex >= 20) return null;
  const own = history.filter((m) => m.color === userColor);
  if (own.length < 3) return null;
  const last = own[own.length - 1]!;

  // Queen sortie before two minor pieces are out.
  const developedMinors = new Set(
    own.filter((m) => /^[NB]/.test(m.san)).map((m) => m.to),
  ).size;
  if (/^Q/.test(last.san) && developedMinors < 2) return "early_queen";

  // Same piece moved twice in a row while pieces sleep at home.
  const previous = own[own.length - 2];
  if (previous && previous.to === last.from && developedMinors < 3) return "same_piece_twice";

  const pawnMoves = own.filter((m) => /^[a-h]/.test(m.san)).length;
  if (pawnMoves >= 4 && developedMinors < 2) return "too_many_pawn_moves";

  const castled = own.some((m) => m.san.startsWith("O-O"));
  if (!castled && own.length >= 8) return "king_uncastled";
  if (developedMinors < 2 && own.length >= 6) return "undeveloped_pieces";
  return null;
}

/** One coarse, non-tactical observation — deliberately conservative. */
export function detectStrategicIssue(
  afterFen: string,
  variant: VariantId,
  userColor: "w" | "b",
  plyIndex: number,
): StrategicIssue | null {
  if (plyIndex < 20) return null;
  let position: RulesPosition;
  try {
    position = rulesFor(variant).createPosition(afterFen);
  } catch {
    return null;
  }
  if (position.turn() !== userColor) {
    // Mobility is measured for the user, so use their turn only.
    return null;
  }
  const moves = position.legalMoves();
  const rookSquares = position
    .boardPieces()
    .filter((p) => p.color === userColor && p.type === "r")
    .map((p) => p.square);
  for (const square of rookSquares) {
    const mobility = moves.filter((m) => m.from === square).length;
    if (mobility === 0) return "trapped_rook";
  }
  if (moves.length > 0 && moves.length <= 12) return "passive_pieces";
  return null;
}

export interface BuildFactsInput {
  variant: VariantId;
  userColor: "w" | "b";
  /** Position before the user's move. */
  beforeFen: string;
  /** Position after the user's move. */
  afterFen: string;
  playedSan: string;
  plyIndex: number;
  moveNumber: number;
  bestUci: string | null;
  evalBeforeCp: number;
  evalAfterCp: number;
  mateBefore: number | null;
  mateAgainst: number | null;
  history: { san: string; from: string; to: string; color: "w" | "b" }[];
}

/** Assembles the deterministic fact sheet fed into `classifyMove`. */
export function buildMoveFacts(input: BuildFactsInput): MoveFacts {
  const adapter = rulesFor(input.variant);
  let before: RulesPosition | null = null;
  try {
    before = adapter.createPosition(input.beforeFen);
  } catch {
    before = null;
  }
  const hanging = findHangingPiece(input.afterFen, input.variant, input.userColor);

  return {
    moveNumber: input.moveNumber,
    plyIndex: input.plyIndex,
    playedSan: input.playedSan,
    bestUci: input.bestUci,
    bestSan: before ? sanForUci(before, input.bestUci) : null,
    evalBeforeCp: input.evalBeforeCp,
    evalAfterCp: input.evalAfterCp,
    mateBefore: input.mateBefore,
    mateAgainst: input.mateAgainst,
    hangingSquare: hanging?.square ?? null,
    hangingPiece: hanging?.piece ?? null,
    bestIsTactic: before ? bestIsTactic(before, input.bestUci, input.mateBefore) : false,
    openingIssue: detectOpeningIssue({
      history: input.history,
      userColor: input.userColor,
      plyIndex: input.plyIndex,
    }),
    strategicIssue: detectStrategicIssue(
      input.afterFen,
      input.variant,
      input.userColor,
      input.plyIndex,
    ),
  };
}
