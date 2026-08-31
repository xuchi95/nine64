/**
 * Personal connection: turns Game Review / Skill Profile weaknesses into the
 * Academy tags that identify the lesson or endgame drill that fixes them.
 */
import type { DimensionKey } from "@/lib/brain/dimensions";

/** Canonical Academy content tags. Lessons declare these in their doc. */
export const ACADEMY_TAGS = [
  "king_pawn",
  "opposition",
  "promotion",
  "rook_endgame",
  "lucena",
  "philidor",
  "queen_endgame",
  "basic_mates",
  "defensive_endgame",
  "endgame",
  "tactics",
  "opening",
  "strategy",
  "calculation",
  "king_safety",
  "pawn_structure",
  "conversion",
  "defence",
  "time_management",
] as const;
export type AcademyTag = (typeof ACADEMY_TAGS)[number];

const BY_DIMENSION: Record<DimensionKey, AcademyTag[]> = {
  opening: ["opening"],
  tactics: ["tactics", "calculation"],
  strategy: ["strategy", "pawn_structure"],
  endgame: ["endgame", "king_pawn", "rook_endgame", "opposition"],
  calculation: ["calculation", "tactics"],
  defence: ["defence", "defensive_endgame"],
  conversion: ["conversion", "basic_mates", "promotion"],
  king_safety: ["king_safety"],
  pawn_structure: ["pawn_structure", "king_pawn"],
  time_management: ["time_management"],
  blunder_frequency: ["tactics", "defence"],
  missed_win_frequency: ["conversion", "basic_mates"],
  complex_position: ["calculation", "strategy"],
};

/** Skill-event keys that map onto a more specific endgame drill. */
const BY_SKILL: Record<string, AcademyTag[]> = {
  king_opposition: ["opposition", "king_pawn"],
  passed_pawn: ["promotion", "king_pawn"],
  rook_activity: ["rook_endgame", "lucena", "philidor"],
  conversion: ["conversion", "basic_mates"],
  defence: ["defensive_endgame", "defence"],
  mating_net: ["basic_mates"],
};

export function tagsForDimensions(dimensions: readonly DimensionKey[]): AcademyTag[] {
  const out: AcademyTag[] = [];
  for (const dim of dimensions) {
    for (const tag of BY_DIMENSION[dim] ?? []) if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

export function tagsForSkills(skills: readonly string[]): AcademyTag[] {
  const out: AcademyTag[] = [];
  for (const skill of skills) {
    for (const tag of BY_SKILL[skill] ?? []) if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

/** Combined recommendation input used by the Daily Plan. */
export function academyTags(input: {
  dimensions?: readonly DimensionKey[];
  skills?: readonly string[];
}): AcademyTag[] {
  const merged = [...tagsForDimensions(input.dimensions ?? []), ...tagsForSkills(input.skills ?? [])];
  return merged.filter((tag, index) => merged.indexOf(tag) === index).slice(0, 8);
}
