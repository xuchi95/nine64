import { translate as t } from "@/lib/i18n";

export type ResultCode = "1-0" | "0-1" | "1/2-1/2" | "*";
export type ResultWinner = "w" | "b" | "draw";

export interface NormalizedResult {
  code: ResultCode;
  winner: ResultWinner;
  reason: string;
}

export function resultCodeFromWinner(winner: ResultWinner): ResultCode {
  if (winner === "w") return "1-0";
  if (winner === "b") return "0-1";
  return "1/2-1/2";
}

/** One shared parser so realtime, fallback polling and replay all agree. */
export function normalizeResult(input: {
  result?: string | null;
  end_reason?: string | null;
}): NormalizedResult | null {
  const code = input.result ?? "*";
  if (code === "*" || !code) return null;
  if (code === "1/2-1/2")
    return { code, winner: "draw", reason: input.end_reason || t("game.result.reasonDraw") };
  if (code === "1-0")
    return { code, winner: "w", reason: input.end_reason || t("game.result.reasonWhiteWins") };
  if (code === "0-1")
    return { code, winner: "b", reason: input.end_reason || t("game.result.reasonBlackWins") };
  return { code: "*", winner: "draw", reason: input.end_reason || t("game.result.reasonGameOver") };
}

/** Perspective label shared by every screen. */
export function resultLabel(
  result: NormalizedResult | null,
  myColor: "w" | "b" | null,
): { title: string; tone: "win" | "loss" | "draw" | "live" } {
  if (!result) return { title: t("game.result.inProgress"), tone: "live" };
  if (result.winner === "draw") return { title: t("game.result.draw"), tone: "draw" };
  if (!myColor) {
    return {
      title: result.winner === "w" ? t("game.result.whiteWins") : t("game.result.blackWins"),
      tone: "draw",
    };
  }
  return result.winner === myColor
    ? { title: t("game.result.youWon"), tone: "win" }
    : { title: t("game.result.youLost"), tone: "loss" };
}
