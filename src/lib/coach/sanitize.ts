/**
 * P0.9 — strict schema + size ceilings for AI Coach input.
 *
 * Everything the model sees is validated and truncated here, before any
 * gateway call is made, so an oversized or hostile payload is rejected without
 * spending credits. The client can never choose the model or a token budget.
 */
import { z } from "zod";
import { COACH_INPUT_LIMITS as L } from "@/lib/ratelimit/policy";
import type { CoachDigest } from "./digest";

const short = z.string().max(L.maxTextField);

export const COACH_DIGEST_SCHEMA = z.object({
  side: z.enum(["w", "b"]),
  playerName: short.default(""),
  opponentName: short.default(""),
  outcome: short.default(""),
  variant: short.default(""),
  timeControl: short.default(""),
  opening: short.nullable().default(null),
  moveCount: z.number().int().min(0).max(1000).default(0),
  accuracy: z
    .object({ player: z.number(), opponent: z.number() })
    .nullable()
    .default(null),
  acpl: z.object({ player: z.number(), opponent: z.number() }).nullable().default(null),
  estimatedRating: z.number().nullable().default(null),
  labelCounts: z.record(z.string().max(40), z.number()).nullable().default(null),
  reviewedAt: z.string().max(40).nullable().default(null),
  timeline: z.array(z.string().max(200)).max(L.maxTimelineEntries).default([]),
  keyMoments: z
    .array(
      z.object({
        id: z.string().max(24).default(""),
        plyIndex: z.number().int().min(0).max(2000).default(0),
        moveNumber: z.number().int().min(0).max(1000),
        san: z.string().max(12),
        label: z.string().max(40),
        lossPct: z.number(),
        bestMove: z.string().max(12).nullable().default(null),
        evalAfter: z.string().max(24),
        phase: z.string().max(24),
        motifs: z.array(z.string().max(40)).max(8).default([]),
      }),
    )
    .max(L.maxKeyMoments)
    .default([]),
  finalFen: z.string().max(L.maxFenChars).default(""),
});


export const COACH_REQUEST_SCHEMA = z.object({
  digest: COACH_DIGEST_SCHEMA,
  locale: z.enum(["vi", "en"]).default("vi"),
});

export class CoachInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoachInputError";
  }
}

/** Validates and hard-truncates the digest. Throws when it is still too big. */
export function sanitizeDigest(input: unknown): CoachDigest {
  const parsed = COACH_DIGEST_SCHEMA.parse(input);

  let chars = 0;
  const timeline: string[] = [];
  for (const line of parsed.timeline.slice(0, L.maxTimelineEntries)) {
    if (chars + line.length > L.maxTimelineChars) break;
    chars += line.length;
    timeline.push(line);
  }

  const digest = {
    ...parsed,
    timeline,
    keyMoments: parsed.keyMoments.slice(0, L.maxKeyMoments),
  } as unknown as CoachDigest;

  if (JSON.stringify(digest).length > L.maxTotalPayloadChars) {
    throw new CoachInputError("COACH_PAYLOAD_TOO_LARGE");
  }
  return digest;
}
