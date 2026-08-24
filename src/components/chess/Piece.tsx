import type { PieceSet } from "@/lib/chess/themes";

export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type PieceColor = "w" | "b";

const GLYPHS: Record<PieceType, string> = {
  k: "\u265A",
  q: "\u265B",
  r: "\u265C",
  b: "\u265D",
  n: "\u265E",
  p: "\u265F",
};

interface Props {
  type: PieceType;
  color: PieceColor;
  set: PieceSet;
  size: number;
  className?: string;
}

/**
 * Vector piece rendering. Glyph outlines scale losslessly at any board size;
 * each piece set restyles fill, stroke weight and depth.
 */
export function Piece({ type, color, set, size, className }: Props) {
  const fill = color === "w" ? set.lightFill : set.darkFill;
  const stroke = color === "w" ? set.lightStroke : set.darkStroke;
  const strokeWidth = set.stroke * 100;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {set.shadow && (
        <ellipse cx="50" cy="88" rx="26" ry="5" fill="rgba(0,0,0,0.22)" />
      )}
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={100 * set.scale}
        fontWeight={set.weight}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        paintOrder="stroke"
        strokeLinejoin="round"
        style={{
          fontFamily:
            "'Noto Sans Symbols 2','Segoe UI Symbol','Apple Symbols','DejaVu Sans',sans-serif",
          filter: set.shadow ? "drop-shadow(0 1px 1px rgba(0,0,0,0.35))" : undefined,
        }}
      >
        {GLYPHS[type]}
      </text>
    </svg>
  );
}

export const PIECE_NAMES: Record<PieceType, string> = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};
