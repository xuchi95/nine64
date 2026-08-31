/**
 * Skill catalogue — the deterministic vocabulary of the Skill Engine.
 *
 * These keys mirror `public.skill_definitions` exactly. The LLM coach never
 * decides skills: detection is pure code (see `detect.ts`), the database owns
 * the XP values, and this file only supplies typing and display metadata.
 */

export type SkillCategory =
  | "fundamentals"
  | "opening"
  | "tactics"
  | "strategy"
  | "endgame"
  | "calculation"
  | "time_management";

export type SkillKey =
  | "development"
  | "king_safety"
  | "center_control"
  | "piece_safety"
  | "opening_principles"
  | "opening_repertoire"
  | "fork"
  | "pin"
  | "skewer"
  | "discovered_attack"
  | "removing_defender"
  | "mating_net"
  | "prophylaxis"
  | "rook_activity"
  | "pawn_structure"
  | "passed_pawn"
  | "king_opposition"
  | "conversion"
  | "calculation_depth"
  | "defence"
  | "time_management";

export interface SkillMeta {
  key: SkillKey;
  category: SkillCategory;
  /** Where a weak skill sends the player next. */
  practice: "puzzles" | "drills" | "openings" | "endgame" | "analysis";
}

export const SKILLS: SkillMeta[] = [
  { key: "development", category: "fundamentals", practice: "drills" },
  { key: "king_safety", category: "fundamentals", practice: "drills" },
  { key: "center_control", category: "fundamentals", practice: "drills" },
  { key: "piece_safety", category: "fundamentals", practice: "puzzles" },
  { key: "opening_principles", category: "opening", practice: "openings" },
  { key: "opening_repertoire", category: "opening", practice: "openings" },
  { key: "fork", category: "tactics", practice: "puzzles" },
  { key: "pin", category: "tactics", practice: "puzzles" },
  { key: "skewer", category: "tactics", practice: "puzzles" },
  { key: "discovered_attack", category: "tactics", practice: "puzzles" },
  { key: "removing_defender", category: "tactics", practice: "puzzles" },
  { key: "mating_net", category: "tactics", practice: "puzzles" },
  { key: "prophylaxis", category: "strategy", practice: "analysis" },
  { key: "rook_activity", category: "strategy", practice: "analysis" },
  { key: "pawn_structure", category: "strategy", practice: "analysis" },
  { key: "passed_pawn", category: "endgame", practice: "endgame" },
  { key: "king_opposition", category: "endgame", practice: "endgame" },
  { key: "conversion", category: "endgame", practice: "endgame" },
  { key: "calculation_depth", category: "calculation", practice: "puzzles" },
  { key: "defence", category: "calculation", practice: "puzzles" },
  { key: "time_management", category: "time_management", practice: "analysis" },
];

export const SKILL_KEYS: SkillKey[] = SKILLS.map((s) => s.key);

const BY_KEY = new Map<SkillKey, SkillMeta>(SKILLS.map((s) => [s.key, s]));

export function skillMeta(key: SkillKey): SkillMeta {
  const meta = BY_KEY.get(key);
  if (!meta) throw new Error(`UNKNOWN_SKILL:${key}`);
  return meta;
}

export function isSkillKey(value: string): value is SkillKey {
  return BY_KEY.has(value as SkillKey);
}

/** Route a skill's "practise this" call to action. */
export const PRACTICE_ROUTE: Record<SkillMeta["practice"], string> = {
  puzzles: "/puzzles",
  drills: "/drills",
  openings: "/openings",
  endgame: "/drills",
  analysis: "/analysis",
};
