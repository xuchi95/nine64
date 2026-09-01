import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_game_moves",
  title: "Get moves of one of my games",
  description:
    "Return the ordered move list (SAN, UCI, FEN after each move, clocks) of a Nine64 online game the signed-in player took part in.",
  inputSchema: {
    game_id: z.string().uuid().describe("The game id, as returned by list_my_games."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ game_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("game_moves")
      .select("move_number, san, uci, fen, white_time_ms, black_time_ms, created_at")
      .eq("game_id", game_id)
      .order("move_number", { ascending: true });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const moves = data ?? [];
    if (moves.length === 0) {
      return {
        content: [
          { type: "text", text: "No moves visible for this game (it may not exist or may not be yours)." },
        ],
        structuredContent: { moves: [] },
      };
    }
    return {
      content: [{ type: "text", text: moves.map((m) => `${m.move_number}. ${m.san}`).join(" ") }],
      structuredContent: { moves },
    };
  },
});
