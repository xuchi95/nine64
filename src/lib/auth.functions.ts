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
    const update: { updated_at: string; display_name?: string; avatar_url?: string | null } = {
      updated_at: new Date().toISOString(),
    };
    if (data.displayName !== undefined) update["display_name"] = data.displayName;
    if (data.avatarUrl !== undefined) update["avatar_url"] = data.avatarUrl || null;

    const { error } = await context.supabase.from("profiles").update(update).eq("id", context.userId);

    if (error) throw new Error(error.message);
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
