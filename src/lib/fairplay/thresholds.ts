import { translate } from "@/lib/i18n";
import type { FairplayAction } from "./types";

export type { FairplayAction };

export const THRESHOLDS = {
  monitor: 40,
  unrated: 70,
  hold: 85,
} as const;

export function actionForScore(score: number): FairplayAction {
  if (score >= THRESHOLDS.hold) return "rating_hold";
  if (score >= THRESHOLDS.unrated) return "unrated";
  if (score >= THRESHOLDS.monitor) return "monitor";
  return "none";
}

/** Player/admin-facing action label. Call at render time so locale switches apply. */
export function actionLabel(action: FairplayAction): string {
  return translate(`admin.action.${action}`);
}

export const ACTION_TONE: Record<FairplayAction, string> = {
  none: "text-muted-foreground",
  monitor: "text-warning",
  unrated: "text-warning",
  rating_hold: "text-destructive",
};

/** Player-facing explanation — deliberately vague so detection stays hard to game. */
export function actionMessage(action: FairplayAction): string {
  return translate(`admin.actionMessage.${action}`);
}
