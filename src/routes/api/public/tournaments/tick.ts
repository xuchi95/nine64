import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Scheduler heartbeat. A cron job hits this every minute; the endpoint itself
 * only authenticates and delegates — all tournament logic lives in the engine.
 */
export const Route = createFileRoute("/api/public/tournaments/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { runScheduler } = await import("@/lib/tournaments/scheduler.server");
        try {
          const report = await runScheduler();
          return Response.json({ ok: true, ...report });
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
