/**
 * Central app configuration. Rename the platform in one place.
 */
export const APP = {
  name: "Nine64",
  shortName: "Nine64",
  tagline: "Play. Analyse. Ascend.",
  description:
    "Nine64 is a premium 2D chess platform: play the Stockfish-powered engine, local matches, and study every move with instant analysis.",
  /** Public contact used on legal pages and for Google OAuth verification. */
  contactEmail: "support@nine64.com",
  /** Canonical public origin used in legal documents. */
  siteUrl: "https://nine64.com",
  /** Fixed effective date shown on legal pages (do not auto-generate). */
  legalEffectiveDate: "2026-09-03",
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
