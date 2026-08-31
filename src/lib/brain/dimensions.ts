/**
 * Player Skill Profile dimensions.
 *
 * The profile is 100% deterministic: every number comes from engine-detected
 * skill events and finished games. No language model is allowed to invent or
 * adjust a score — the AI layer may only phrase what this file produces.
 */
import type { SkillKey } from "@/lib/skills/catalog";

export type DimensionKey =
  | "opening"
  | "tactics"
  | "strategy"
  | "endgame"
  | "calculation"
  | "defence"
  | "conversion"
  | "king_safety"
  | "pawn_structure"
  | "time_management"
  | "blunder_frequency"
  | "missed_win_frequency"
  | "complex_position";

export const DIMENSION_KEYS: DimensionKey[] = [
  "opening",
  "tactics",
  "strategy",
  "endgame",
  "calculation",
  "defence",
  "conversion",
  "king_safety",
  "pawn_structure",
  "time_management",
  "blunder_frequency",
  "missed_win_frequency",
  "complex_position",
];

/**
 * Which skill events feed each dimension. Dimensions with an empty list are
 * derived from move labels instead (see `profile.ts`).
 */
export const DIMENSION_SKILLS: Record<DimensionKey, SkillKey[]> = {
  opening: ["opening_principles", "opening_repertoire", "development", "center_control"],
  tactics: ["fork", "pin", "skewer", "discovered_attack", "removing_defender", "mating_net"],
  strategy: ["prophylaxis", "rook_activity", "pawn_structure", "center_control"],
  endgame: ["passed_pawn", "king_opposition", "conversion"],
  calculation: ["calculation_depth", "piece_safety"],
  defence: ["defence", "king_safety"],
  conversion: ["conversion"],
  king_safety: ["king_safety"],
  pawn_structure: ["pawn_structure", "passed_pawn"],
  time_management: ["time_management"],
  blunder_frequency: [],
  missed_win_frequency: [],
  complex_position: [],
};

/** Dimensions where a *low* raw rate is good (the score is inverted). */
export const INVERTED_DIMENSIONS: DimensionKey[] = [
  "blunder_frequency",
  "missed_win_frequency",
];

/** Where practising this dimension sends the player. */
export const DIMENSION_PRACTICE: Record<DimensionKey, "tactics" | "opening" | "endgame" | "retry" | "review"> = {
  opening: "opening",
  tactics: "tactics",
  strategy: "review",
  endgame: "endgame",
  calculation: "tactics",
  defence: "tactics",
  conversion: "endgame",
  king_safety: "review",
  pawn_structure: "review",
  time_management: "review",
  blunder_frequency: "retry",
  missed_win_frequency: "retry",
  complex_position: "tactics",
};
