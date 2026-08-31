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
  /**
   * Canonical key moment id (`ply-<index>`), assigned by the server from the
   * digest. Legacy reports stored before this field existed omit it.
   */
  momentId?: string;
  /** 0-based ply index, filled in by the server — never by the model. */
  plyIndex?: number;
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
  /**
   * `review.reviewedAt` of the engine data this explanation was written from.
   * Missing on legacy reports — the UI must render those without a staleness
   * claim rather than crashing.
   */
  sourceReviewedAt?: string | null;
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
