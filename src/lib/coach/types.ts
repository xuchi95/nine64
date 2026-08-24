export type MistakeSeverity = "basic" | "moderate" | "serious" | "critical";

export const SEVERITY_META: Record<
  MistakeSeverity,
  { title: string; tone: string; ring: string; order: number }
> = {
  basic: {
    title: "Lỗi cơ bản",
    tone: "text-muted-foreground",
    ring: "border-border bg-surface-2",
    order: 0,
  },
  moderate: {
    title: "Lỗi đáng chú ý",
    tone: "text-warning",
    ring: "border-warning/30 bg-warning/10",
    order: 1,
  },
  serious: {
    title: "Lỗi nghiêm trọng",
    tone: "text-warning",
    ring: "border-warning/50 bg-warning/15",
    order: 2,
  },
  critical: {
    title: "Lỗi trầm trọng",
    tone: "text-destructive",
    ring: "border-destructive/50 bg-destructive/15",
    order: 3,
  },
};

export interface CoachMistake {
  /** Move number in the game (1-based full move number). */
  moveNumber: number;
  san: string;
  severity: MistakeSeverity;
  title: string;
  whatHappened: string;
  betterPlan: string;
}

export interface CoachReport {
  createdAt: string;
  /** Which side the commentary is written for. */
  side: "w" | "b";
  headline: string;
  verdict: string;
  levelImpression: string;
  phases: { opening: string; middlegame: string; endgame: string };
  strengths: string[];
  mistakes: CoachMistake[];
  habits: string[];
  advice: string[];
  drills: string[];
}
