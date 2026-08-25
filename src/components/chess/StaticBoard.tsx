import { useCallback, useEffect, useRef, useState } from "react";
import { Piece, type PieceColor, type PieceType } from "./Piece";
import { FILES, RANKS, isDarkSquare, squareSurface } from "./boardSurface";
import { getBoardTheme, getPieceSet } from "@/lib/chess/themes";
import { cn } from "@/lib/utils";
import type { BoardPiece } from "./ChessBoard";

/**
 * Measures the board's available width and rounds it down to a size where each
 * of the 8 squares is a whole number of device pixels. Prevents the blurry
 * half-pixel seams and off-by-a-pixel piece placement seen on HiDPI screens.
 */
function usePixelSnappedBoard() {
  const el = useRef<HTMLDivElement | null>(null);
  const [snappedWidth, setSnappedWidth] = useState<number | null>(null);

  const measure = useCallback(() => {
    const node = el.current;
    const parent = node?.parentElement;
    if (!node || !parent) return;
    const dpr = window.devicePixelRatio || 1;
    const available = parent.getBoundingClientRect().width;
    if (available <= 0) return;
    const unit = 8 / dpr; // css px granularity that keeps 8 squares pixel-aligned
    const next = Math.max(unit, Math.floor(available / unit) * unit);
    setSnappedWidth((prev) => (prev !== null && Math.abs(prev - next) < 0.01 ? prev : next));
  }, []);

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      el.current = node;
      measure();
    },
    [measure],
  );

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const parent = el.current?.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    ro.observe(parent);
    const onDpr = () => measure();
    window.addEventListener("resize", onDpr);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onDpr);
    };
  }, [measure]);

  return { ref, snappedWidth };
}


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

  const { ref, snappedWidth } = usePixelSnappedBoard();

  return (
    <div
      ref={ref}
      data-static-board=""
      className={cn("overflow-hidden rounded-xl shadow-2xl", className)}
      style={{
        border: `1px solid ${theme.frame}`,
        // Snap to a whole number of device pixels per square so square seams
        // and piece strokes land on the pixel grid instead of being resampled.
        ...(snappedWidth ? { width: snappedWidth, marginInline: "auto" } : null),
      }}
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
