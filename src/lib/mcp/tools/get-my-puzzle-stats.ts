import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_my_puzzle_stats",
  title: "Get my puzzle training stats",
  description:
    "Return the signed-in player's Nine64 puzzle training stats: attempts, solved, hints used, streaks, sprint/survival bests and per-theme accuracy.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("puzzle_user_stats")
      .select(
        "attempts, solved, hints_used, current_streak, best_streak, sprint_best, survival_best, theme_stats, last_solved_at",
      )
      .eq("user_id", ctx.getUserId())
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const stats = data ?? {
      attempts: 0,
      solved: 0,
      hints_used: 0,
      current_streak: 0,
      best_streak: 0,
      sprint_best: 0,
      survival_best: 0,
      theme_stats: {},
      last_solved_at: null,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(stats) }],
      structuredContent: { stats },
    };
  },
});
