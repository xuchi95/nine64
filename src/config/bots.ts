export type EngineMode = "performance" | "balanced" | "maximum";

export interface BotLevel {
  level: number;
  title: string;
  /** Stockfish "Skill Level" UCI option (0-20). null = unrestricted. */
  skill: number | null;
  /** UCI_Elo limit; null = no limit. */
  uciElo: number | null;
  depth: number | null;
  /** engine movetime budget in ms */
  moveTimeMs: number;
  /** how much random opening deviation at low levels (0-1) */
  openingRandomness: number;
  strength: string;
  /** Where the search runs. Levels 1-15 run in the browser (offline capable). */
  runtime?: "browser" | "cloud";
}

export const BOT_LEVELS: BotLevel[] = [
  { level: 1, title: "Beginner", skill: 0, uciElo: 1320, depth: 2, moveTimeMs: 60, openingRandomness: 0.8, strength: "~800 est." },
  { level: 2, title: "Casual", skill: 1, uciElo: 1400, depth: 3, moveTimeMs: 80, openingRandomness: 0.65, strength: "~1000 est." },
  { level: 3, title: "Amateur", skill: 2, uciElo: 1500, depth: 4, moveTimeMs: 100, openingRandomness: 0.5, strength: "~1200 est." },
  { level: 4, title: "Intermediate", skill: 4, uciElo: 1600, depth: 5, moveTimeMs: 140, openingRandomness: 0.4, strength: "~1400 est." },
  { level: 5, title: "Club", skill: 6, uciElo: 1700, depth: 6, moveTimeMs: 180, openingRandomness: 0.3, strength: "~1600 est." },
  { level: 6, title: "Strong Club", skill: 8, uciElo: 1850, depth: 7, moveTimeMs: 250, openingRandomness: 0.22, strength: "~1800 est." },
  { level: 7, title: "Expert", skill: 10, uciElo: 2000, depth: 9, moveTimeMs: 350, openingRandomness: 0.15, strength: "~2000 est." },
  { level: 8, title: "Candidate Master", skill: 12, uciElo: 2150, depth: 11, moveTimeMs: 500, openingRandomness: 0.1, strength: "~2200 est." },
  { level: 9, title: "Master", skill: 14, uciElo: 2300, depth: 13, moveTimeMs: 700, openingRandomness: 0.06, strength: "~2300 est." },
  { level: 10, title: "International Master", skill: 16, uciElo: 2450, depth: 15, moveTimeMs: 1000, openingRandomness: 0.04, strength: "~2450 est." },
  { level: 11, title: "Grandmaster", skill: 18, uciElo: 2600, depth: 17, moveTimeMs: 1500, openingRandomness: 0.02, strength: "~2600 est." },
  { level: 12, title: "Super GM", skill: 20, uciElo: 2750, depth: 19, moveTimeMs: 2200, openingRandomness: 0, strength: "~2750 est." },
  { level: 13, title: "Engine", skill: null, uciElo: null, depth: 20, moveTimeMs: 3000, openingRandomness: 0, strength: "Engine strength" },
  { level: 14, title: "Engine Pro", skill: null, uciElo: null, depth: 24, moveTimeMs: 5000, openingRandomness: 0, strength: "Engine strength" },
  { level: 15, title: "Engine Max", skill: null, uciElo: null, depth: null, moveTimeMs: 8000, openingRandomness: 0, strength: "Engine Max", runtime: "browser" },
  // Level 16 runs official Stockfish 18 on a private server with far more
  // threads/hash than any browser build. No Elo cap, no randomness, no
  // personality tolerance — and no claim of being unbeatable.
  { level: 16, title: "Nine64 Titan", skill: 20, uciElo: null, depth: null, moveTimeMs: 12000, openingRandomness: 0, strength: "Sức mạnh máy tối đa", runtime: "cloud" },
];

export interface BotPersonality {
  id: string;
  name: string;
  blurb: string;
  /**
   * Preferred opening moves (SAN). Applied as a soft bonus inside the
   * personality reranker during the opening phase only, and only for moves the
   * engine already proposed within the level's eval-loss budget.
   */
  openings: string[];
  /**
   * Base eval tolerance in centipawns. Scaled down per level by
   * `toleranceFor()` — style never buys a blunder.
   */
  evalTolerance: number;
  accent: string;
}

export const BOT_PERSONALITIES: BotPersonality[] = [
  {
    id: "atlas",
    name: "Atlas",
    blurb: "Balanced positional play. Builds slowly, punishes loose pieces.",
    openings: ["d4", "Nf3", "c4"],
    evalTolerance: 25,
    accent: "primary",
  },
  {
    id: "viper",
    name: "Viper",
    blurb: "Aggressive tactician. Hunts the king from move one.",
    openings: ["e4", "f4"],
    evalTolerance: 45,
    accent: "destructive",
  },
  {
    id: "fortress",
    name: "Fortress",
    blurb: "Defensive wall. Trades into safety and grinds endgames.",
    openings: ["d4", "e3", "Nf3"],
    evalTolerance: 20,
    accent: "accent",
  },
  {
    id: "gambit",
    name: "Gambit",
    blurb: "Sacrifices material early for a dangerous initiative.",
    openings: ["e4", "d4", "b4"],
    evalTolerance: 60,
    accent: "warning",
  },
  {
    id: "nova",
    name: "Nova",
    blurb: "Dynamic and sharp. Loves imbalanced structures.",
    openings: ["e4", "c4", "Nf3"],
    evalTolerance: 35,
    accent: "accent",
  },
  {
    id: "oracle",
    name: "Oracle",
    blurb: "Maximum calculation. No style, only the best move.",
    openings: [],
    evalTolerance: 0,
    accent: "primary",
  },
  {
    id: "chaos",
    name: "Chaos",
    blurb: "Unpredictable move selection, still strong.",
    openings: ["e4", "d4", "c4", "Nf3", "g3", "b3"],
    evalTolerance: 70,
    accent: "warning",
  },
];

export function getBotLevel(level: number): BotLevel {
  return BOT_LEVELS.find((l) => l.level === level) ?? BOT_LEVELS[7]!;
}

export function getPersonality(id: string): BotPersonality {
  return BOT_PERSONALITIES.find((p) => p.id === id) ?? BOT_PERSONALITIES[0]!;
}

import { translate } from "@/lib/i18n";

export function botLevelTitle(level: number): string {
  const key = `play.bots.level.${level}.title`;
  const translated = translate(key);
  // Never leak a raw i18n key to the UI — fall back to the config title.
  if (translated === key) return getBotLevel(level).title;
  return translated;
}

export function personalityName(id: string): string {
  return translate(`play.bots.personality.${id}.name`);
}

export function personalityBlurb(id: string): string {
  return translate(`play.bots.personality.${id}.blurb`);
}
