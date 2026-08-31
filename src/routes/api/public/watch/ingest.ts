/**
 * Broadcast PGN push endpoint.
 *
 * External relays POST here with `Authorization: Bearer <source token>`. The
 * token is matched against the source's stored SHA-256 hash, so a caller can
 * only write into the event its own source belongs to.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({
  sourceId: z.string().uuid(),
  pgn: z.string().min(10).max(2_000_000),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export const Route = createFileRoute("/api/public/watch/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
        if (!token) return json({ ok: false, error: "MISSING_TOKEN" }, 401);

        let parsed: z.infer<typeof BodySchema>;
        try {
          parsed = BodySchema.parse(await request.json());
        } catch {
          return json({ ok: false, error: "INVALID_BODY" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { hashToken } = await import("@/lib/watch/adminWatch.functions");
        const { data } = await supabaseAdmin
          .from("broadcast_sources")
          .select("id, name, event_id, token_hash, status")
          .eq("id", parsed.sourceId)
          .maybeSingle();

        const row = data as Record<string, unknown> | null;
        const expected = row?.["token_hash"] as string | undefined;
        if (!row || !expected || (await hashToken(token)) !== expected) {
          return json({ ok: false, error: "UNAUTHORIZED" }, 401);
        }
        if (row["status"] === "paused") return json({ ok: false, error: "SOURCE_PAUSED" }, 409);

        const { ingestPgn } = await import("@/lib/watch/ingest.server");
        const report = await ingestPgn({
          eventId: row["event_id"] as string,
          sourceId: row["id"] as string,
          sourceName: row["name"] as string,
          pgn: parsed.pgn,
        });
        return json(report, report.ok ? 200 : 422);
      },
    },
  },
});
