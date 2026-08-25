import { Piece, type PieceColor, type PieceType } from "./Piece";
import { FILES, RANKS, isDarkSquare, squareSurface } from "./boardSurface";
import { getBoardTheme, getPieceSet } from "@/lib/chess/themes";
import { cn } from "@/lib/utils";
import type { BoardPiece } from "./ChessBoard";

export interface StaticBoardProps {
  pieces: BoardPiece[];
  boardTheme: string;
  pieceSet: string;
  orientation?: PieceColor;
  className?: string;
}

/**
 * Non-interactive board surface (hero art, previews, thumbnails).
 * Shares the exact square painting and SVG piece rendering with the real
 * game board, so marketing visuals can never drift from gameplay.
 */
export function StaticBoard({
  pieces,
  boardTheme,
  pieceSet,
  orientation = "w",
  className,
}: StaticBoardProps) {
  const theme = getBoardTheme(boardTheme);
  const set = getPieceSet(pieceSet);
  const files = orientation === "w" ? FILES : [...FILES].reverse();
  const ranks = orientation === "w" ? RANKS : [...RANKS].reverse();
  const bySquare = new Map(pieces.map((p) => [p.square, p]));

  return (
    <div
      data-static-board=""
      className={cn("overflow-hidden rounded-xl shadow-2xl", className)}
      style={{ border: `1px solid ${theme.frame}` }}
      aria-hidden
    >
      <div className="grid grid-cols-8">
        {ranks.map((rank) =>
          files.map((file) => {
            const square = `${file}${rank}`;
            const piece = bySquare.get(square);
            return (
              <div
                key={square}
                data-square={square}
                className="relative aspect-square"
                style={squareSurface(theme, isDarkSquare(file, rank))}
              >
                {piece && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Piece
                      type={piece.type}
                      color={piece.color}
                      set={set}
                      size={100}
                      className="h-full w-full"
                    />
                  </div>
                )}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

const BACK_RANK: PieceType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];

/** Standard starting position expressed as board pieces. */
export const START_PIECES: BoardPiece[] = FILES.flatMap((file, i) => [
  { square: `${file}8`, type: BACK_RANK[i]!, color: "b" as PieceColor },
  { square: `${file}7`, type: "p" as PieceType, color: "b" as PieceColor },
  { square: `${file}2`, type: "p" as PieceType, color: "w" as PieceColor },
  { square: `${file}1`, type: BACK_RANK[i]!, color: "w" as PieceColor },
]);
