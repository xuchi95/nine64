import { z } from "zod";
import { isOnlinePlayable } from "@/config/variants";
import { generateChess960Position, isValidChess960Start } from "@/lib/chess/chess960";
import { canonicalChess960Fen } from "@/lib/chess/rules";


export const QUEUE_SCHEMA = z.object({
  // Server-side capability gate: a variant may only be queued online when the
  // rule engine actually validates its moves.
  variant: z.string().min(1).refine(isOnlinePlayable, {
    message: "VARIANT_NOT_ONLINE_PLAYABLE",
  }),
  timeControl: z.string().min(1),
});


const SQUARE = z.string().regex(/^[a-h][1-8]$/);

/**
 * Minimal move intent. The client may only express *what it wants to play*;
 * SAN, UCI, FEN, clocks and results are derived server-side.
 */
export const MOVE_SCHEMA = z
  .object({
    gameId: z.string().uuid(),
    from: SQUARE,
    to: SQUARE,
    promotion: z.enum(["q", "r", "b", "n"]).optional(),
    expectedVersion: z.number().int().min(0),
  })
  .strict();

export const GAME_ID_SCHEMA = z.object({ gameId: z.string().uuid() });

export const TRY_MATCH_SCHEMA = z.object({ queueId: z.string().uuid() });

export const NOTIFICATION_ID_SCHEMA = z.object({ id: z.string().uuid() });

/**
 * Terminal commands carry no result, winner, reason or FEN: the server derives
 * every canonical value itself. `expectedVersion` guards against replays.
 */
export const GAME_COMMAND_SCHEMA = z
  .object({
    gameId: z.string().uuid(),
    expectedVersion: z.number().int().min(0),
  })
  .strict();

export const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function timeControlToMs(timeControl: string): number {
  switch (timeControl) {
    case "blitz1m":
      return 60_000;
    case "blitz3m":
      return 180_000;
    case "blitz5m":
      return 300_000;
    case "rapid10m":
      return 600_000;
    case "rapid15m":
      return 900_000;
    case "rapid30m":
      return 1_800_000;
    default:
      return 300_000;
  }
}

/**
 * Starting FEN for an online game.
 *
 * Only variants marked `onlinePlayable` in the capability registry can reach
 * this function (QUEUE_SCHEMA rejects the rest), so the classical array is the
 * canonical answer for standard. Chess960 draws a Scharnagl array from
 * `generateChess960Position` — never an ad-hoc shuffle — and returns the
 * canonical Shredder-FEN so the rook files behind each castling right survive
 * every round trip. Called exactly once, when the match is created.
 */
export function startingFenForVariant(variant: string): string {
  if (!isOnlinePlayable(variant)) {
    // Defence in depth: never hand back a position for a variant whose rules
    // the server cannot validate, even if a caller bypasses QUEUE_SCHEMA.
    throw new Error(`VARIANT_NOT_ONLINE_PLAYABLE:${variant}`);
  }
  if (variant === "chess960") {
    const fen = canonicalChess960Fen(generateChess960Position().shredderFen);
    if (!isValidChess960Start(fen)) {
      throw new Error("CHESS960_INVALID_FEN");
    }
    return fen;
  }
  return STANDARD_FEN;
}

/** Draw offer commands. Idempotency key is supplied by the caller and reused on retry. */
export const DRAW_OFFER_SCHEMA = z
  .object({
    gameId: z.string().uuid(),
    expectedVersion: z.number().int().min(0),
    idempotencyKey: z.string().min(8).max(100),
  })
  .strict();

export const DRAW_RESPONSE_SCHEMA = z
  .object({
    gameId: z.string().uuid(),
    offerId: z.string().uuid(),
    expectedVersion: z.number().int().min(0),
  })
  .strict();
