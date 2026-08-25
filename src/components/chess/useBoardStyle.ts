import { updateSettings, useSettings } from "@/lib/settings";
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
    boardThemeAuto: settings.boardThemeAuto,
    pieceSetAuto: settings.pieceSetAuto,
    anyAuto: settings.boardThemeAuto || settings.pieceSetAuto,
    /** Manual selection helpers — the only supported way to change board style. */
    selectBoardTheme,
    selectPieceSet,
    setStyleAuto,
  };
}

/** Pick a board theme by hand; pins it so light/dark swaps cannot override it. */
export function selectBoardTheme(id: string) {
  updateSettings({ boardTheme: id, boardThemeAuto: false });
}

/** Pick a piece set by hand; pins it so light/dark swaps cannot override it. */
export function selectPieceSet(id: string) {
  updateSettings({ pieceSet: id, pieceSetAuto: false });
}

/** Toggle both auto-follow flags at once (manual mode = false). */
export function setStyleAuto(auto: boolean) {
  updateSettings({ boardThemeAuto: auto, pieceSetAuto: auto });
}
