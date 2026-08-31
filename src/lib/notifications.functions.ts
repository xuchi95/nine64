import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFairplayAdmin } from "@/lib/fairplay/adminGuard";
import type { NotificationOutboxEvent } from "@/lib/database.types";

/**
 * Admin observability for the transactional notification outbox. Delivery
 * itself is server-side; this only exposes stuck/failed events and a retry.
 */
export const listNotificationOutbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        status: z.enum(["all", "queued", "processing", "delivered", "failed"]).default("failed"),
        limit: z.number().int().min(10).max(200).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertFairplayAdmin(context);

    let query = context.supabase
      .from("notification_outbox")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as NotificationOutboxEvent[];
  });

export const retryNotificationEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertFairplayAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.rpc("retry_notification_event", { _id: data.id });
    if (error) throw new Error(error.message);

    const { error: kickError } = await supabaseAdmin.rpc("process_notification_outbox", {
      _limit: 50,
    });
    if (kickError) console.error("Outbox kick after retry failed", kickError.message);

    return { ok: true };
  });
