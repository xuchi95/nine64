import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_games",
  title: "List my online games",
  description:
    "List the signed-in player's most recent Nine64 online games with variant, time control, status, result and opponent id.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(10).describe("How many games to return (1-50)."),
    status: z
      .enum(["any", "active", "finished"])
      .default("any")
      .describe("Filter by game status."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const userId = ctx.getUserId();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("games")
      .select(
        "id, white_id, black_id, variant, time_control, status, result, end_reason, winner_id, created_at, updated_at",
      )
      .or(`white_id.eq.${userId},black_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status !== "any") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const games = (data ?? []).map((g) => ({
      ...g,
      my_color: g.white_id === userId ? "white" : "black",
      opponent_id: g.white_id === userId ? g.black_id : g.white_id,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(games) }],
      structuredContent: { games },
    };
  },
});
