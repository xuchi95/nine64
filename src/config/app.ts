/**
 * Central app configuration. Rename the platform in one place.
 */
export const APP = {
  name: "Nexus Chess",
  shortName: "Nexus",
  tagline: "Play. Analyse. Ascend.",
  description:
    "Nexus Chess is a premium 2D chess platform: play the Stockfish-powered engine, local matches, and study every move with instant analysis.",
} as const;

export type TimeCategory = "Bullet" | "Blitz" | "Rapid" | "Classical";

export interface TimeControl {
  id: string;
  category: TimeCategory;
  /** initial time in seconds */
  initial: number;
  /** increment per move in seconds */
  increment: number;
  label: string;
}

function tc(category: TimeCategory, minutes: number, increment: number): TimeControl {
  return {
    id: `${minutes}+${increment}`,
    category,
    initial: minutes * 60,
    increment,
    label: `${minutes}+${increment}`,
  };
}

export const TIME_CONTROLS: TimeControl[] = [
  tc("Bullet", 1, 0),
  tc("Bullet", 1, 1),
  tc("Bullet", 2, 1),
  tc("Blitz", 3, 0),
  tc("Blitz", 3, 2),
  tc("Blitz", 5, 0),
  tc("Blitz", 5, 3),
  tc("Rapid", 10, 0),
  tc("Rapid", 10, 5),
  tc("Rapid", 15, 10),
  tc("Classical", 30, 0),
  tc("Classical", 30, 20),
];

export const TIME_CATEGORIES: TimeCategory[] = ["Bullet", "Blitz", "Rapid", "Classical"];

export function customTimeControl(minutes: number, increment: number): TimeControl {
  const category: TimeCategory =
    minutes < 3 ? "Bullet" : minutes < 10 ? "Blitz" : minutes < 30 ? "Rapid" : "Classical";
  return {
    id: `custom-${minutes}+${increment}`,
    category,
    initial: Math.round(minutes * 60),
    increment,
    label: `${minutes}+${increment}`,
  };
}
