import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { COACH_REQUEST_SCHEMA } from "@/lib/coach/sanitize";
import type { CoachReport } from "@/lib/coach/types";

/**
 * AI Coach — the only paid endpoint in the app.
 *
 * Auth required, strict schema + size ceilings, and quota consumed atomically
 * (burst per minute + per-day) BEFORE the gateway is called. The client cannot
 * pick a model or a token budget; both are server constants.
 */
export const coachGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => COACH_REQUEST_SCHEMA.parse(input))
  .handler(async ({ data, context }): Promise<CoachReport> => {
    const { enforceAll, userSubject } = await import("@/lib/ratelimit/limiter.server");
    const { sanitizeDigest } = await import("@/lib/coach/sanitize");
    const subject = userSubject(context.userId);

    // Reject oversized input before spending any quota or credits.
    const digest = sanitizeDigest(data.digest);

    await enforceAll([
      { action: "coach.burst", subject },
      { action: "coach.daily", subject },
    ]);

    const { requestCoachReport } = await import("@/lib/coach/gateway.server");
    return requestCoachReport(digest, data.locale);
  });
