import { generateChess960Position } from "@/lib/chess/chess960";
import {
  RulesError,
  type ChessRulesAdapter,
  type RulesPosition,
} from "./ChessRulesAdapter";

/**
 * Chess960 rule engine — INTENTIONALLY NOT IMPLEMENTED YET.
 *
 * chess.js 1.4 (the project's rule engine) does not implement Chess960
 * castling: with a king on b1 and rooks on a1/h1 it generates `O-O` as the
 * plain king move b1-d1 and never produces the a-side castle at all. Wiring
 * Chess960 through it would create illegal positions and desynchronise the
 * server's canonical FEN from the client.
 *
 * Rather than hand-coding castling special cases, the adapter reports itself
 * as unsupported. The variant capability registry keeps Chess960 off every
 * play surface until a verified 960 engine is integrated.
 */
export const CHESS960_UNSUPPORTED_REASON =
  "chess.js 1.4 does not implement Chess960 castling (king/rook on arbitrary files)";

function unavailable(): never {
  throw new RulesError("RULES_ENGINE_UNAVAILABLE", CHESS960_UNSUPPORTED_REASON);
}

export const Chess960Rules: ChessRulesAdapter = {
  engine: "chess960-unimplemented",
  supported: false,
  unsupportedReason: CHESS960_UNSUPPORTED_REASON,
  supportsArbitraryCastling: false,
  pgnVariantTag: "Chess960",
  /** Position generation is correct and reusable; move rules are not. */
  startingFen: () => generateChess960Position().fen,
  createPosition: (): RulesPosition => unavailable(),
  validateMove: () => unavailable(),
};
