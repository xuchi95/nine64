/**
 * Opening Explorer server proxy.
 *
 * The browser sends a SAN path (never a raw provider URL); the server replays
 * it with chess.js, resolves the FEN itself, rate-limits the caller and reads
 * through the cached provider proxy.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Chess } from "chess.js";
import {
  EXPLORER_RATINGS,
  EXPLORER_SPEEDS,
  normaliseFilters,
  type ExplorerPosition,
  type ExplorerRating,
  type ExplorerSpeed,
} from "./explorerTypes";

const Input = z.object({
  sans: z.array(z.string().max(10)).max(40).default([]),
  source: z.enum(["masters", "lichess"]).default("masters"),
  speeds: z.array(z.enum(EXPLORER_SPEEDS as unknown as [ExplorerSpeed, ...ExplorerSpeed[]])).max(6).default([]),
  ratings: z
    .array(z.number().refine((n) => (EXPLORER_RATINGS as readonly number[]).includes(n)))
    .max(9)
    .default([]),
  sinceYear: z.number().int().min(1952).max(2100).default(2015),
});

export const fetchOpeningExplorer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<ExplorerPosition> => {
    const chess = new Chess();
    const played: string[] = [];
    for (const san of data.sans) {
      try {
        if (!chess.move(san)) break;
        played.push(san);
      } catch {
        break;
      }
    }

    const { enforceRateLimit, ipSubject } = await import("@/lib/ratelimit/limiter.server");
    await enforceRateLimit("openings.explorer", ipSubject());

    const filters = normaliseFilters({
      source: data.source,
      speeds: data.speeds as ExplorerSpeed[],
      ratings: data.ratings as ExplorerRating[],
      sinceYear: data.sinceYear,
    });
    const { readExplorer } = await import("./explorer.server");
    return readExplorer(chess.fen(), filters, played);
  });

/** ECO + opening name for a SAN path, resolved from the embedded open dataset. */
export const resolveOpeningName = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ sans: z.array(z.string().max(10)).max(60) }).parse(input))
  .handler(async ({ data }) => {
    const { ecoForPath } = await import("./eco.server");
    const hit = ecoForPath(data.sans);
    return hit ? { eco: hit.eco, name: hit.name, path: hit.path } : null;
  });
