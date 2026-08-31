import { useMemo } from "react";
import { Chess } from "chess.js";
import { ChessBoard } from "@/components/chess/ChessBoard";

export interface OpeningBoardProps {
  /** SAN path from the start position. */
  sans: string[];
  orientation: "w" | "b";
  onPush?: (san: string) => void;
  arrows?: { from: string; to: string; ply: number }[];
  interactive?: boolean;
}

/** Shared read/replay board for every Opening Lab tab. */
export function OpeningBoard({
  sans,
  orientation,
  onPush,
  arrows = [],
  interactive = true,
}: OpeningBoardProps) {
  const position = useMemo(() => {
    const chess = new Chess();
    for (const san of sans) {
      try {
        if (!chess.move(san)) break;
      } catch {
        break;
      }
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
    const history = chess.history({ verbose: true });
    const last = history[history.length - 1];
    return {
      chess,
      pieces,
      fen: chess.fen(),
      turn: chess.turn() as "w" | "b",
      checkSquare,
      lastMove: last ? { from: last.from as string, to: last.to as string } : null,
    };
  }, [sans]);

  return (
    <ChessBoard
      pieces={position.pieces}
      orientation={orientation}
      legalTargets={(square) =>
        interactive
          ? position.chess.moves({ square: square as never, verbose: true }).map((m) => m.to as string)
          : []
      }
      canMoveFrom={(square) => {
        if (!interactive || !onPush) return false;
        const piece = position.chess.get(square as never);
        return !!piece && piece.color === position.turn;
      }}
      onMove={(from, to, promotion) => {
        if (!onPush) return false;
        try {
          const probe = new Chess(position.fen);
          const move = probe.move({ from, to, promotion: promotion ?? "q" });
          if (!move) return false;
          onPush(move.san);
          return true;
        } catch {
          return false;
        }
      }}
      needsPromotion={(from, to) => {
        const piece = position.chess.get(from as never);
        if (!piece || piece.type !== "p") return false;
        return (piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1");
      }}
      lastMove={position.lastMove}
      checkSquare={position.checkSquare}
      arrows={arrows}
      turn={position.turn}
    />
  );
}

export function moveNumberLabel(ply: number): string {
  const no = Math.floor(ply / 2) + 1;
  return ply % 2 === 0 ? `${no}.` : `${no}…`;
}

export function pathLabel(sans: readonly string[]): string {
  return sans.map((san, i) => `${moveNumberLabel(i)} ${san}`).join(" ");
}

export function fenAfter(sans: readonly string[]): string {
  const chess = new Chess();
  for (const san of sans) {
    try {
      if (!chess.move(san)) break;
    } catch {
      break;
    }
  }
  return chess.fen();
}
