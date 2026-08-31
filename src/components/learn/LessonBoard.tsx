import { useMemo } from "react";
import { Chess } from "chess.js";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { FILES, RANKS } from "@/components/chess/boardSurface";
import { cn } from "@/lib/utils";

export interface LessonBoardProps {
  fen: string;
  orientation: "white" | "black";
  /** Squares the lesson author wants ringed (teaching overlay). */
  highlights?: string[];
  arrows?: { from: string; to: string; ply: number }[];
  interactive?: boolean;
  lastMove?: { from: string; to: string } | null;
  onMove?: (move: { from: string; to: string; promotion?: "q" | "r" | "b" | "n" }) => boolean;
}

/**
 * Board used by every Academy step: a FEN position with author-defined arrows
 * and highlighted squares, optionally accepting one learner move.
 */
export function LessonBoard({
  fen,
  orientation,
  highlights = [],
  arrows = [],
  interactive = false,
  lastMove = null,
  onMove,
}: LessonBoardProps) {
  const position = useMemo(() => {
    let chess: Chess;
    try {
      chess = new Chess(fen);
    } catch {
      chess = new Chess();
    }
    const pieces = chess
      .board()
      .flat()
      .filter((sq): sq is NonNullable<typeof sq> => sq !== null)
      .map((sq) => ({ square: sq.square as string, type: sq.type, color: sq.color }));
    let checkSquare: string | null = null;
    if (chess.isCheck()) {
      for (const row of chess.board())
        for (const sq of row)
          if (sq && sq.type === "k" && sq.color === chess.turn()) checkSquare = sq.square as string;
    }
    return { chess, pieces, turn: chess.turn() as "w" | "b", checkSquare };
  }, [fen]);

  const files = orientation === "white" ? FILES : [...FILES].reverse();
  const ranks = orientation === "white" ? RANKS : [...RANKS].reverse();
  const ringed = new Set(highlights.map((s) => s.toLowerCase()));

  return (
    <div className="relative">
      <ChessBoard
        pieces={position.pieces}
        orientation={orientation === "white" ? "w" : "b"}
        legalTargets={(square) =>
          interactive
            ? position.chess.moves({ square: square as never, verbose: true }).map((m) => m.to as string)
            : []
        }
        canMoveFrom={(square) => {
          if (!interactive || !onMove) return false;
          const piece = position.chess.get(square as never);
          return !!piece && piece.color === position.turn;
        }}
        onMove={(from, to, promotion) =>
          onMove ? onMove(promotion ? { from, to, promotion } : { from, to }) : false
        }
        needsPromotion={(from, to) => {
          const piece = position.chess.get(from as never);
          if (!piece || piece.type !== "p") return false;
          return (piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1");
        }}
        lastMove={lastMove}
        checkSquare={position.checkSquare}
        arrows={arrows}
        interactive={interactive}
        turn={position.turn}
      />
      {ringed.size > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 grid grid-cols-8 grid-rows-8 p-[1px]"
        >
          {ranks.map((rank) =>
            files.map((file) => {
              const square = `${file}${rank}`;
              return (
                <div
                  key={square}
                  className={cn(
                    "rounded-[2px]",
                    ringed.has(square) && "ring-2 ring-inset ring-primary/80 shadow-[0_0_12px_hsl(var(--primary)/0.45)]",
                  )}
                />
              );
            }),
          )}
        </div>
      ) : null}
    </div>
  );
}
