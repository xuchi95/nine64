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
