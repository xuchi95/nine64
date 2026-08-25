import { useSettings } from "@/lib/settings";
import {
  getBoardTheme,
  getPieceSet,
  resolveBoardThemeId,
  resolvePieceSetId,
} from "@/lib/chess/themes";

/**
 * Single source of truth for which board theme / piece set is on screen.
 * Every board surface (game board, hero board, previews) uses this so the
 * light/dark variant swap can never apply to one board and not the other.
 */
export function useBoardStyle() {
  const settings = useSettings();
  const mode = settings.appearance === "dark" ? "dark" : "light";
  const boardThemeId = resolveBoardThemeId(settings.boardTheme, mode);
  const pieceSetId = resolvePieceSetId(settings.pieceSet, mode);
  return {
    mode,
    boardThemeId,
    pieceSetId,
    theme: getBoardTheme(boardThemeId),
    pieceSet: getPieceSet(pieceSetId),
  };
}
