/**
 * Tablebase lookup exposed to the browser (proxied, cached, breaker-guarded).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { TablebaseResult } from "./tablebase.server";

export const probeEndgame = createServerFn({ method: "GET" })
  .inputValidator((input: { fen: string }) => z.object({ fen: z.string().min(10).max(120) }).parse(input))
  .handler(async ({ data }): Promise<TablebaseResult> => {
    const { probeTablebase } = await import("./tablebase.server");
    return probeTablebase(data.fen);
  });
