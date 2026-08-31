import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, display_name, avatar_url, rating, games_played, wins, losses, draws, created_at")
      .eq("id", context.userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new Error(error.message);
    }
    return data;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        displayName: z.string().min(1).max(32).optional(),
        avatarUrl: z.string().url().max(1024).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { enforceRateLimit, userSubject } = await import("@/lib/ratelimit/limiter.server");
    await enforceRateLimit("profile.update", userSubject(context.userId));
    // Direct UPDATE on profiles is revoked; the allowlisted RPC is the only path.
    const { data: result, error } = await context.supabase.rpc("update_my_profile", {
      _display_name: data.displayName ?? (null as unknown as string),
      _avatar_url: data.avatarUrl ?? (null as unknown as string),
    });

    if (error) throw new Error(error.message);
    const payload = (result ?? {}) as { ok?: boolean; code?: string };
    if (!payload.ok) throw new Error(payload.code ?? "PROFILE_UPDATE_FAILED");
    return { ok: true };
  });


export const hasRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ role: z.enum(["admin", "moderator", "user"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: data.role,
    });
    if (error) throw new Error(error.message);
    return Boolean(result);
  });
