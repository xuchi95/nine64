import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHAT_MAX_LENGTH, type GameChatMessage } from "@/lib/chat/messages";

const LIST_SCHEMA = z.object({
  gameId: z.string().uuid(),
  /** ISO timestamp: only rows created after it are returned (delta sync). */
  since: z.string().datetime().nullish(),
});

const SEND_SCHEMA = z.object({
  gameId: z.string().uuid(),
  body: z.string().trim().min(1).max(CHAT_MAX_LENGTH),
  /** Number of moves played when the message was written. */
  ply: z.number().int().min(0).max(2000),
});

const COLUMNS = "id, game_id, user_id, author_name, author_role, ply, body, created_at";

/** Transcript for one game, oldest first. Readable by any signed-in viewer. */
export const listGameChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => LIST_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("game_chat_messages")
      .select(COLUMNS)
      .eq("game_id", data.gameId)
      .order("created_at", { ascending: true })
      .limit(300);

    if (data.since) query = query.gt("created_at", data.since);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as GameChatMessage[];
  });

/**
 * Post a message. The database trigger stamps the display name and whether the
 * author is a player or a spectator, so neither can be spoofed by the client.
 */
export const sendGameChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SEND_SCHEMA.parse(input))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit, userSubject } = await import("@/lib/ratelimit/limiter.server");
    await enforceRateLimit("chat.send", userSubject(context.userId));

    const { data: row, error } = await context.supabase
      .from("game_chat_messages")
      .insert({
        game_id: data.gameId,
        user_id: context.userId,
        body: data.body,
        ply: data.ply,
      })
      .select(COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return row as unknown as GameChatMessage;
  });
