/** Puzzle modes and their session rules. */
import type { ThemeKey } from "./themes";

export const PUZZLE_MODES = [
  "adaptive",
  "personal",
  "rated",
  "theme",
  "opening",
  "endgame",
  "sprint",
  "survival",
  "blind",
] as const;

export type PuzzleMode = (typeof PUZZLE_MODES)[number];

export interface ModeRules {
  /** Whether the attempt moves the user's puzzle Glicko-2 rating. */
  rated: boolean;
  /** Timed run length in seconds (sprint only). */
  durations?: number[];
  /** Lives before the run ends (survival only). */
  lives?: number;
  /** Board pieces are hidden after the position is shown (blind calculation). */
  blind?: boolean;
  /** Only personal (from-your-games) puzzles. */
  personalOnly?: boolean;
  phase?: "opening" | "endgame";
  /** Difficulty grows with each solved puzzle inside the run. */
  ramp: number;
}

export const MODE_RULES: Record<PuzzleMode, ModeRules> = {
  adaptive: { rated: false, ramp: 0 },
  personal: { rated: false, personalOnly: true, ramp: 0 },
  rated: { rated: true, ramp: 0 },
  theme: { rated: false, ramp: 0 },
  opening: { rated: false, phase: "opening", ramp: 0 },
  endgame: { rated: false, phase: "endgame", ramp: 0 },
  sprint: { rated: false, durations: [180, 300], ramp: 35 },
  survival: { rated: false, lives: 3, ramp: 45 },
  blind: { rated: false, blind: true, ramp: 0 },
};

export const SPRINT_DURATIONS = [180, 300] as const;
export const SURVIVAL_LIVES = 3;

export function isPuzzleMode(value: unknown): value is PuzzleMode {
  return typeof value === "string" && (PUZZLE_MODES as readonly string[]).includes(value);
}

/** Target rating for the n-th puzzle of a run (difficulty ramps upward). */
export function rampTarget(mode: PuzzleMode, baseRating: number, solvedInRun: number): number {
  const ramp = MODE_RULES[mode].ramp;
  if (ramp === 0) return baseRating;
  return Math.round(baseRating + ramp * solvedInRun);
}

/** Sprint score: harder puzzles are worth more, streaks add a small bonus. */
export function sprintPoints(puzzleRating: number, streak: number): number {
  const base = Math.max(1, Math.round(puzzleRating / 200));
  return base + Math.min(5, Math.floor(streak / 3));
}

export interface ModeSelectionFilter {
  personalOnly: boolean;
  phase: "opening" | "endgame" | null;
  themes: ThemeKey[];
}

export function selectionFilterFor(mode: PuzzleMode, themes: ThemeKey[]): ModeSelectionFilter {
  const rules = MODE_RULES[mode];
  return {
    personalOnly: rules.personalOnly ?? false,
    phase: rules.phase ?? null,
    themes: mode === "theme" ? themes : [],
  };
}
