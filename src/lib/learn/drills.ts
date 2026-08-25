import { useSyncExternalStore } from "react";
import { SEVERITY_META, type MistakeSeverity } from "@/lib/coach/types";
import type { SavedGame } from "@/lib/history";
import { MOTIF_LABEL } from "@/lib/analysis/motifs";

/** A concrete practice task derived from one of the player's mistakes. */
export interface Drill {
  /** Stable id so completion survives re-reviews. */
  id: string;
  gameId: string;
  gameLabel: string;
  playedAt: string;
  /** Ply index in the game (0-based), or null for general drills. */
  ply: number | null;
  moveLabel: string;
  san: string | null;
  severity: MistakeSeverity;
  title: string;
  /** What went wrong, in the coach's words. */
  problem: string;
  /** The practice task itself. */
  task: string;
  /** Win-percent thrown away, when known. */
  loss: number | null;
  themes: string[];
}

/* ------------------------------ derive drills ----------------------------- */

const LABEL_SEVERITY: Record<string, MistakeSeverity> = {
  inaccuracy: "basic",
  mistake: "moderate",
  miss: "serious",
  blunder: "critical",
};

/** Archive entries can carry unknown/legacy severities — never index blindly. */
function safeSeverity(value: unknown): MistakeSeverity {
  return typeof value === "string" && value in SEVERITY_META
    ? (value as MistakeSeverity)
    : "moderate";
}

function severityFromLoss(loss: number): MistakeSeverity {
  if (loss >= 25) return "critical";
  if (loss >= 15) return "serious";
  if (loss >= 8) return "moderate";
  return "basic";
}

function moveLabelFor(ply: number): string {
  const moveNo = Math.floor(ply / 2) + 1;
  return ply % 2 === 0 ? `${moveNo}.` : `${moveNo}...`;
}

function gameLabel(game: SavedGame): string {
  return `${game.white?.name ?? "?"} – ${game.black?.name ?? "?"}`;
}

function themeNames(motifs: unknown): string[] {
  if (!Array.isArray(motifs)) return [];
  return (motifs as string[])
    .map((m) => (MOTIF_LABEL as Record<string, string | undefined>)[m] ?? m)
    .slice(0, 3);
}

function taskFor(drill: {
  severity: MistakeSeverity;
  themes: string[];
  moveLabel: string;
  san: string | null;
}): string {
  const theme = drill.themes[0];
  const where = drill.san ? `nước ${drill.moveLabel} ${drill.san}` : "vị trí này";
  if (drill.severity === "critical") {
    return `Mở lại ${where} trong bàn phân tích, tự tìm nước tốt hơn trong 2 phút rồi so với biến thể của engine${
      theme ? `; ôn lại chủ đề "${theme}"` : ""
    }.`;
  }
  if (drill.severity === "serious") {
    return `Đi lại ${where} 3 lần liên tiếp mà không xem gợi ý, mỗi lần nói ra kế hoạch trước khi đi${
      theme ? ` (chú ý "${theme}")` : ""
    }.`;
  }
  if (drill.severity === "moderate") {
    return `Kiểm tra lại ${where}: liệt kê mọi nước ăn quân/chiếu của đối thủ trước khi chọn nước đi.`;
  }
  return `Xem nhanh ${where} và ghi lại 1 câu về nguyên nhân chọn sai.`;
}

/**
 * Builds a practice list from the player's worst mistakes across the archive.
 * Coach reports (expert commentary) take priority; reviewed plies fill the gaps.
 * Ordered by severity, then by evaluation swing.
 */
export function buildDrills(games: SavedGame[], limit = 40): Drill[] {
  const drills: Drill[] = [];

  for (const game of Array.isArray(games) ? games : []) {
    if (!game || typeof game !== "object") continue;
    const label = gameLabel(game);
    const coachSide = game.coach?.side ?? game.playerColor ?? "w";

    // 1) Coach-detected mistakes — richest wording.
    const coachPlies = new Set<number>();
    for (const mistake of Array.isArray(game.coach?.mistakes) ? game.coach.mistakes : []) {
      const severity = safeSeverity(mistake?.severity);
      const moveNumber = Number.isFinite(Number(mistake?.moveNumber))
        ? Number(mistake.moveNumber)
        : 1;
      const ply = Math.max(0, (moveNumber - 1) * 2 + (coachSide === "b" ? 1 : 0));
      coachPlies.add(ply);
      const plyInfo = game.review?.plies?.[ply];
      drills.push({
        id: `${game.id}:${ply}:coach`,
        gameId: game.id,
        gameLabel: label,
        playedAt: game.playedAt,
        ply,
        moveLabel: moveLabelFor(ply),
        san: mistake?.san || (plyInfo?.san ?? null),
        severity,
        title: mistake?.title ?? "Sai lầm cần xem lại",
        problem: mistake?.whatHappened ?? "",
        task: mistake?.betterPlan || taskFor({
          severity,
          themes: themeNames(plyInfo?.motifs ?? []),
          moveLabel: moveLabelFor(ply),
          san: mistake?.san ?? null,
        }),
        loss: typeof plyInfo?.loss === "number" ? plyInfo.loss : null,
        themes: themeNames(plyInfo?.motifs ?? []),
      });
    }

    // 2) Engine-review mistakes for the player's own moves.
    for (const ply of Array.isArray(game.review?.plies) ? game.review.plies : []) {
      if (!ply) continue;
      if (game.playerColor && ply.color !== game.playerColor) continue;
      if (coachPlies.has(ply.index)) continue;
      const severity = LABEL_SEVERITY[ply.label] ?? severityFromLoss(Number(ply.loss) || 0);
      if (severity === "basic" && ply.loss < 8) continue;
      const themes = themeNames(ply.motifs ?? []);
      const moveLabel = moveLabelFor(ply.index);
      drills.push({
        id: `${game.id}:${ply.index}:engine`,
        gameId: game.id,
        gameLabel: label,
        playedAt: game.playedAt,
        ply: ply.index,
        moveLabel,
        san: ply.san,
        severity,
        title: `${SEVERITY_META[severity].title} tại ${moveLabel} ${ply.san}`,
        problem: `Mất ${ply.loss}% cơ hội thắng so với nước tốt nhất của engine${
          themes.length > 0 ? ` · ${themes.join(", ")}` : ""
        }.`,
        task: taskFor({ severity, themes, moveLabel, san: ply.san }),
        loss: ply.loss,
        themes,
      });
    }

    // 3) Coach's own suggested exercises.
    (Array.isArray(game.coach?.drills) ? game.coach.drills : []).forEach((text, i) => {
      drills.push({
        id: `${game.id}:advice-${i}`,
        gameId: game.id,
        gameLabel: label,
        playedAt: game.playedAt,
        ply: null,
        moveLabel: "—",
        san: null,
        severity: "moderate",
        title: "Bài tập từ chuyên gia",
        problem: "Đề xuất luyện tập dựa trên toàn bộ ván đấu.",
        task: text,
        loss: null,
        themes: [],
      });
    });
  }

  return drills
    .sort((a, b) => {
      const bySeverity =
        SEVERITY_META[safeSeverity(b.severity)].order -
        SEVERITY_META[safeSeverity(a.severity)].order;
      if (bySeverity !== 0) return bySeverity;
      const byLoss = (b.loss ?? 0) - (a.loss ?? 0);
      if (byLoss !== 0) return byLoss;
      return new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime();
    })
    .slice(0, limit);
}

/* ---------------------------- completion tracking -------------------------- */

const KEY = "nexus-chess.drills.v1";

interface DrillProgress {
  /** drill id -> ISO completion timestamp. */
  done: Record<string, string>;
}

let progress: DrillProgress = { done: {} };
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* ignore quota errors */
  }
}

export function hydrateDrills() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DrillProgress>;
      progress = { done: parsed.done ?? {} };
    }
  } catch {
    progress = { done: {} };
  }
  emit();
}

export function setDrillDone(id: string, done: boolean) {
  hydrateDrills();
  const next = { ...progress.done };
  if (done) next[id] = new Date().toISOString();
  else delete next[id];
  progress = { done: next };
  persist();
  emit();
}

export function clearDrillProgress() {
  progress = { done: {} };
  persist();
  emit();
}

function subscribe(listener: () => void) {
  hydrateDrills();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: Record<string, string> = {};

/** Map of completed drill ids to their completion timestamp. */
export function useDrillProgress(): Record<string, string> {
  return useSyncExternalStore(
    subscribe,
    () => progress.done,
    () => EMPTY,
  );
}
