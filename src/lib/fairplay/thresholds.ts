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

export const ACTION_LABEL: Record<FairplayAction, string> = {
  none: "Bình thường",
  monitor: "Đang theo dõi",
  unrated: "Ván không tính rating",
  rating_hold: "Tạm khoá xếp hạng",
};

export const ACTION_TONE: Record<FairplayAction, string> = {
  none: "text-muted-foreground",
  monitor: "text-warning",
  unrated: "text-warning",
  rating_hold: "text-destructive",
};

/** Player-facing explanation — deliberately vague so detection stays hard to game. */
export const ACTION_MESSAGE: Record<FairplayAction, string> = {
  none: "Không có dấu hiệu bất thường trong các ván gần đây.",
  monitor: "Hệ thống đang xem xét một vài chỉ số bất thường. Chưa có hạn chế nào.",
  unrated: "Một số ván gần đây không được tính rating do chỉ số bất thường.",
  rating_hold:
    "Xếp hạng của bạn đang tạm khoá để đội ngũ fair play xem xét. Bạn vẫn chơi được ván thường.",
};
