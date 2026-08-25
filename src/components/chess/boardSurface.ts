import type { CSSProperties } from "react";
import type { BoardTheme } from "@/lib/chess/themes";

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
export const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

/** Square colour parity used by every board surface (a8 is a light square). */
export function isDarkSquare(file: string, rank: string): boolean {
  return (FILES.indexOf(file) + Number(rank)) % 2 === 0;
}

/**
 * The single source of truth for how a board square is painted. Both the
 * interactive game board and the static hero board consume this, so the
 * surfaces can never drift apart.
 */
export function squareSurface(theme: BoardTheme, dark: boolean): CSSProperties {
  return {
    backgroundColor: dark ? theme.dark : theme.light,
    backgroundImage: dark
      ? "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(0,0,0,0.14) 55%, rgba(0,0,0,0.22))"
      : "linear-gradient(135deg, rgba(255,255,255,0.30), rgba(0,0,0,0.05) 60%, rgba(0,0,0,0.10))",
    boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.08)",
  };
}

/* ── Piece placement ─────────────────────────────────────────────────────────
 * Every board (interactive or static) positions a piece exactly the same way:
 * an absolutely positioned box of one square, moved with translate3d, holding
 * a scale wrapper and the SVG. Sharing these helpers guarantees hero art and
 * gameplay can never drift by a sub-pixel at any size.
 */

/** Zero-based column/row of a square for the given orientation. */
export function squareToIndex(square: string, orientation: "w" | "b") {
  const file = FILES.indexOf(square[0]!);
  const rank = RANKS.indexOf(square[1]!);
  return orientation === "w" ? { col: file, row: rank } : { col: 7 - file, row: 7 - rank };
}

/** Box for one piece. Lengths are CSS values so px and % boards behave alike. */
export function pieceBoxStyle(x: string, y: string, size: string): CSSProperties {
  return {
    position: "absolute",
    left: 0,
    top: 0,
    width: size,
    height: size,
    transform: `translate3d(${x}, ${y}, 0)`,
    backfaceVisibility: "hidden",
  };
}

/** Percentage-based box used by fluid boards (hero art, previews). */
export function pieceBoxStylePct(square: string, orientation: "w" | "b"): CSSProperties {
  const { col, row } = squareToIndex(square, orientation);
  return pieceBoxStyle(`${col * 100}%`, `${row * 100}%`, "12.5%");
}

/** The only three piece scales any board may use. */
export const PIECE_SCALE = {
  idle: "scale(1) translateZ(0)",
  travelling: "scale(1.06) translateZ(0)",
  dragging: "scale(1.1) translateZ(0)",
} as const;

export type PieceMotion = keyof typeof PIECE_SCALE;
