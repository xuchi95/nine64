import { z } from "zod";

export const QUEUE_SCHEMA = z.object({
  variant: z.string().min(1),
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

export const FINISH_GAME_SCHEMA = z.object({
  gameId: z.string().uuid(),
  result: z.enum(["1-0", "0-1", "1/2-1/2", "*"]),
  winnerId: z.string().uuid().nullable(),
  endReason: z.string().min(1),
  finalFen: z.string().min(10),
});

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

function pickOne<T>(items: T[]): T {
  const value = items[Math.floor(Math.random() * items.length)];
  if (value === undefined) throw new Error("Cannot pick from an empty list");
  return value;
}

function shuffleStrings(arr: string[]): string[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = a[i];
    const target = a[j];
    if (current === undefined || target === undefined) continue;
    a[i] = target;
    a[j] = current;
  }
  return a;
}

function isValid960BackRank(pieces: string[]): boolean {
  const kingIndex = pieces.indexOf("k");
  const rookLeft = pieces.indexOf("r");
  const rookRight = pieces.lastIndexOf("r");
  return kingIndex > rookLeft && kingIndex < rookRight;
}

function generateChess960Fen(): string {
  const lightSquares = [1, 3, 5, 7];
  const darkSquares = [0, 2, 4, 6];
  const b1 = pickOne(lightSquares);
  const b2 = pickOne(darkSquares);

  const remaining = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => i !== b1 && i !== b2);
  let pieces: string[];
  do {
    pieces = shuffleStrings(
      remaining.map((i) => {
        if (i === 0 || i === 7) return "r";
        if (i === 1 || i === 6) return "n";
        if (i === 2 || i === 5) return "b";
        if (i === 3) return "q";
        return "k";
      }),
    );
  } while (!isValid960BackRank(pieces));

  const rank = Array.from({ length: 8 }, () => "");
  rank[b1] = "b";
  rank[b2] = "b";
  let idx = 0;
  for (let i = 0; i < 8; i++) {
    if (rank[i]) continue;
    const piece = pieces[idx];
    if (piece === undefined) throw new Error("Invalid Chess960 back rank");
    rank[i] = piece;
    idx += 1;
  }
  return `${rank.join("")}/pppppppp/8/8/8/8/PPPPPPPP/${rank.join("").toUpperCase()} w KQkq - 0 1`;
}

export function startingFenForVariant(variant: string): string {
  return variant === "chess960" ? generateChess960Fen() : STANDARD_FEN;
}