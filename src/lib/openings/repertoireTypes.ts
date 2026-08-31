/** Client-safe repertoire contracts shared by server functions and the UI. */

export type RepertoireColor = "white" | "black";
export type MoveKind = "main" | "alternative" | "avoid";

export interface Repertoire {
  id: string;
  color: RepertoireColor;
  name: string;
  description: string;
  isDefault: boolean;
  lines: number;
  moves: number;
  updatedAt: string;
}

export interface RepertoireMove {
  id: string;
  lineId: string;
  repertoireId: string;
  path: string;
  parentPath: string;
  ply: number;
  san: string;
  uci: string;
  fen: string;
  kind: MoveKind;
  isOwnMove: boolean;
  notes: string;
}

export interface RepertoireLine {
  id: string;
  repertoireId: string;
  name: string;
  eco: string | null;
  openingName: string | null;
  rootPath: string;
  notes: string;
  moves: RepertoireMove[];
  updatedAt: string;
}

export interface PracticeCard {
  id: string;
  moveId: string;
  repertoireId: string;
  color: RepertoireColor;
  path: string;
  fen: string;
  expectedSan: string;
  /** SAN path the client replays to reach the question position. */
  setup: string[];
  notes: string;
  openingName: string | null;
  eco: string | null;
  due: string;
  reps: number;
  lapses: number;
}

export function sansOf(path: string): string[] {
  return path ? path.split(" ").filter(Boolean) : [];
}

export function pathOf(sans: readonly string[]): string {
  return sans.join(" ");
}

/** True when the move at `ply` (0-based) belongs to the repertoire owner. */
export function isOwnPly(ply: number, color: RepertoireColor): boolean {
  return color === "white" ? ply % 2 === 0 : ply % 2 === 1;
}
