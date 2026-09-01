import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get-my-profile";
import listMyGames from "./tools/list-my-games";
import getGameMoves from "./tools/get-game-moves";
import getMyPuzzleStats from "./tools/get-my-puzzle-stats";

// The OAuth issuer must be the direct Supabase host, inlined at build time.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "chess-master-platform",
  title: "Chess Master Platform",
  version: "0.1.0",
  instructions:
    "Tools for the Nine64 chess platform. Use `get_my_profile` for the signed-in player's rating and record, `list_my_games` for recent online games, `get_game_moves` for the move list of one of those games, and `get_my_puzzle_stats` for puzzle training progress. All tools act as the signed-in user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfile, listMyGames, getGameMoves, getMyPuzzleStats].map((tool) => tool as never),
});
