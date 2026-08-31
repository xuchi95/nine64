/**
 * Watch Center ingestion heartbeat.
 *
 * A cron job hits this; it polls due PGN URL sources and RSS news feeds.
 * Authentication is the shared cron secret — no source-specific token here.
 */

import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/watch/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        try {
          const { pollBroadcastSources, ingestNewsFeeds } = await import("@/lib/watch/ingest.server");
          const broadcasts = await pollBroadcastSources();
          const news = await ingestNewsFeeds();
          return Response.json({ ok: true, broadcasts, news });
        } catch (error) {
          return Response.json(
            { ok: false, message: error instanceof Error ? error.message : "unknown" },
            { status: 500 },
          );
        }
      },
    },
  },
});
