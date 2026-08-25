import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Piece, type PieceColor, type PieceType } from "./Piece";
import { FILES, RANKS, isDarkSquare, squareSurface } from "./boardSurface";
import { getBoardTheme, getPieceSet } from "@/lib/chess/themes";
import { cn } from "@/lib/utils";
import type { BoardPiece } from "./ChessBoard";

/**
 * Measures the board's available width and rounds it down to a size where each
 * of the 8 squares is a whole number of device pixels (prevents blurry seams on
 * HiDPI screens).
 *
 * Perf: the snapped width is written straight to the node's style inside a
 * single rAF instead of going through React state, so dragging a window edge
 * never re-renders the 64 squares / 32 SVG pieces — it only mutates one
 * inline width.
 */
function usePixelSnappedBoard() {
  const el = useRef<HTMLDivElement | null>(null);
  const applied = useRef<number>(0);
  const frame = useRef<number>(0);

  const measure = useCallback(() => {
    const node = el.current;
    const parent = node?.parentElement;
    if (!node || !parent) return;
    const available = parent.getBoundingClientRect().width;
    if (available <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const unit = 8 / dpr; // css px granularity that keeps 8 squares pixel-aligned
    const next = Math.max(unit, Math.floor(available / unit) * unit);
    if (Math.abs(applied.current - next) < 0.01) return;
    applied.current = next;
    node.style.width = `${next}px`;
    node.style.marginInline = "auto";
  }, []);

  const schedule = useCallback(() => {
    if (frame.current) return; // coalesce bursts of resize events into one frame
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      measure();
    });
  }, [measure]);

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      el.current = node;
      if (node) measure();
    },
    [measure],
  );

  useEffect(() => {
    const parent = el.current?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(schedule);
    ro.observe(parent);
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [schedule]);

  return ref;
}

export interface StaticBoardProps {
  pieces: BoardPiece[];
  boardTheme: string;
  pieceSet: string;
  orientation?: PieceColor;
  className?: string;
}

/** Squares only. Memoised so resizing never touches this subtree. */
const BoardGrid = memo(function BoardGrid({
  pieces,
  boardTheme,
  pieceSet,
  orientation,
}: Omit<StaticBoardProps, "className"> & { orientation: PieceColor }) {
  const cells = useMemo(() => {
    const theme = getBoardTheme(boardTheme);
    const set = getPieceSet(pieceSet);
    // Two shared style objects instead of 64 freshly allocated ones.
    const surfaces = [squareSurface(theme, false), squareSurface(theme, true)] as const;
    const files = orientation === "w" ? FILES : [...FILES].reverse();
    const ranks = orientation === "w" ? RANKS : [...RANKS].reverse();
    const bySquare = new Map(pieces.map((p) => [p.square, p]));

    return ranks.flatMap((rank) =>
      files.map((file) => {
        const square = `${file}${rank}`;
        const piece = bySquare.get(square);
        return (
          <div
            key={square}
            data-square={square}
            className="relative aspect-square"
            style={surfaces[isDarkSquare(file, rank) ? 1 : 0]}
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
    );
  }, [pieces, boardTheme, pieceSet, orientation]);

  return <div className="grid grid-cols-8">{cells}</div>;
});

/**
 * Non-interactive board surface (hero art, previews, thumbnails).
 * Shares the exact square painting and SVG piece rendering with the real
 * game board, so marketing visuals can never drift from gameplay.
 */
export const StaticBoard = memo(function StaticBoard({
  pieces,
  boardTheme,
  pieceSet,
  orientation = "w",
  className,
}: StaticBoardProps) {
  const ref = usePixelSnappedBoard();
  const frame = getBoardTheme(boardTheme).frame;
  const style = useMemo(
    // `contain` keeps resize work inside the board instead of the page layout.
    () => ({ border: `1px solid ${frame}`, contain: "layout paint" as const }),
    [frame],
  );

  return (
    <div
      ref={ref}
      data-static-board=""
      className={cn("overflow-hidden rounded-xl shadow-2xl", className)}
      style={style}
      aria-hidden
    >
      <BoardGrid
        pieces={pieces}
        boardTheme={boardTheme}
        pieceSet={pieceSet}
        orientation={orientation}
      />
    </div>
  );
});


const BACK_RANK: PieceType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];

/** Standard starting position expressed as board pieces. */
export const START_PIECES: BoardPiece[] = FILES.flatMap((file, i) => [
  { square: `${file}8`, type: BACK_RANK[i]!, color: "b" as PieceColor },
  { square: `${file}7`, type: "p" as PieceType, color: "b" as PieceColor },
  { square: `${file}2`, type: "p" as PieceType, color: "w" as PieceColor },
  { square: `${file}1`, type: BACK_RANK[i]!, color: "w" as PieceColor },
]);
