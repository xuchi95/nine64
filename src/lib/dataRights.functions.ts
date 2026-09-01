import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Self-service grace period before a deletion request becomes irreversible. */
export const SELF_DELETION_GRACE_HOURS = 72;

export interface DataRightsStatus {
  pending: {
    id: string;
    mode: string;
    status: string;
    graceUntil: string;
    createdAt: string;
  } | null;
}

/**
 * Full export of the personal data described in the privacy policy.
 * Runs with the caller's own RLS context, so it can never read another user.
 */
export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const userId = context.userId;

    const [profile, games, offline, puzzles, ratings, learn, notifications] = await Promise.all([
      sb.from("profiles").select("*").eq("id", userId).maybeSingle(),
      sb
        .from("games")
        .select("*")
        .or(`white_id.eq.${userId},black_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(2000),
      sb.from("offline_games").select("*").eq("user_id", userId).limit(5000),
      sb.from("puzzle_attempts").select("*").eq("user_id", userId).limit(5000),
      sb.from("rating_events").select("*").eq("user_id", userId).limit(5000),
      sb.from("learn_progress").select("*").eq("user_id", userId).limit(5000),
      sb.from("notifications").select("*").eq("user_id", userId).limit(1000),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      format: "nine64.data-export.v1",
      account: {
        id: userId,
        email: context.claims?.email ?? null,
      },
      profile: profile.data ?? null,
      games: games.data ?? [],
      offlineGames: offline.data ?? [],
      puzzleAttempts: puzzles.data ?? [],
      ratingEvents: ratings.data ?? [],
      learningProgress: learn.data ?? [],
      notifications: notifications.data ?? [],
    };
  });

/** Current self-service deletion request, if any. */
export const getMyDataRightsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DataRightsStatus> => {
    const { data } = await context.supabase
      .from("account_deletion_jobs")
      .select("id, mode, status, grace_until, created_at")
      .eq("user_id", context.userId)
      .in("status", ["pending", "processing"])
      .maybeSingle();

    return {
      pending: data
        ? {
            id: data.id,
            mode: data.mode,
            status: data.status,
            graceUntil: data.grace_until,
            createdAt: data.created_at,
          }
        : null,
    };
  });

const DELETE_SCHEMA = z.object({
  mode: z.enum(["anonymize", "delete"]),
  reason: z.string().min(10).max(500),
  confirmation: z.string().min(1),
});

/** Queue a deletion of the caller's own account after a cancellable grace period. */
export const requestMyAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => DELETE_SCHEMA.parse(data))
  .handler(async ({ data, context }) => {
    if (data.confirmation.trim().toUpperCase() !== "DELETE") {
      return { ok: false as const, code: "CONFIRMATION_MISMATCH" };
    }

    const { data: existing } = await context.supabase
      .from("account_deletion_jobs")
      .select("id")
      .eq("user_id", context.userId)
      .in("status", ["pending", "processing"])
      .maybeSingle();
    if (existing) return { ok: false as const, code: "ALREADY_PENDING" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const graceUntil = new Date(
      Date.now() + SELF_DELETION_GRACE_HOURS * 3600_000,
    ).toISOString();

    const { error } = await supabaseAdmin.from("account_deletion_jobs").insert({
      user_id: context.userId,
      mode: data.mode,
      reason: `[self-service] ${data.reason.trim()}`,
      requested_by: context.userId,
      grace_until: graceUntil,
    });
    if (error) {
      console.error("[data-rights] deletion insert failed:", { code: error.code });
      return { ok: false as const, code: "DELETION_JOB_FAILED" };
    }

    return { ok: true as const, graceUntil };
  });

/** Cancel a pending self-service deletion while still inside the grace period. */
export const cancelMyAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("account_deletion_jobs")
      .update({ status: "cancelled" })
      .eq("user_id", context.userId)
      .eq("status", "pending");
    if (error) return { ok: false as const, code: "CANCEL_FAILED" };
    return { ok: true as const };
  });
