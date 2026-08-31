/**
 * Personal Skill Graph aggregation — pure functions over stored progress rows.
 */
import { SKILLS, skillMeta, type SkillCategory, type SkillKey } from "./catalog";

export interface SkillProgressRow {
  skillKey: SkillKey;
  xp: number;
  level: number;
  positives: number;
  negatives: number;
}

export type SkillStatus = "mastered" | "developing" | "weak" | "unseen";

export interface SkillNode extends SkillProgressRow {
  category: SkillCategory;
  status: SkillStatus;
  /** 0–100 reliability of the sample, used to avoid judging on 1 event. */
  confidence: number;
  successRate: number;
}

export function skillStatus(row: SkillProgressRow): SkillStatus {
  const total = row.positives + row.negatives;
  if (total === 0) return "unseen";
  const rate = row.positives / total;
  if (total < 4) return "developing";
  if (rate >= 0.75 && row.level >= 2) return "mastered";
  if (rate < 0.45) return "weak";
  return "developing";
}

export function buildSkillGraph(rows: SkillProgressRow[]): SkillNode[] {
  const byKey = new Map(rows.map((r) => [r.skillKey, r]));
  return SKILLS.map((meta) => {
    const row: SkillProgressRow = byKey.get(meta.key) ?? {
      skillKey: meta.key,
      xp: 0,
      level: 0,
      positives: 0,
      negatives: 0,
    };
    const total = row.positives + row.negatives;
    return {
      ...row,
      category: meta.category,
      status: skillStatus(row),
      confidence: Math.min(100, total * 10),
      successRate: total ? Math.round((row.positives / total) * 100) : 0,
    };
  });
}

/** The three weakest skills with enough evidence to act on. */
export function focusSkills(nodes: SkillNode[], limit = 3): SkillNode[] {
  return [...nodes]
    .filter((n) => n.status === "weak" || (n.status === "developing" && n.negatives >= 2))
    .sort((a, b) => a.successRate - b.successRate || b.negatives - a.negatives)
    .slice(0, limit);
}

export function practiceRouteFor(key: SkillKey): string {
  return skillMeta(key).practice;
}
