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
  // A theme the user picked by hand is used verbatim; only the automatic
  // default follows the light/dark variant map.
  const boardThemeId = settings.boardThemeAuto
    ? resolveBoardThemeId(settings.boardTheme, mode)
    : settings.boardTheme;
  const pieceSetId = settings.pieceSetAuto
    ? resolvePieceSetId(settings.pieceSet, mode)
    : settings.pieceSet;
  return {
    mode,
    boardThemeId,
    pieceSetId,
    theme: getBoardTheme(boardThemeId),
    pieceSet: getPieceSet(pieceSetId),
  };
}
