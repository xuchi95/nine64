/**
 * Deep-analysis UX contract: the default layer stays plain-language, the
 * technical layer is opt-in and bounded, and the AI can never invent moves.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Chess } from "chess.js";
import type { PlyAnalysis } from "@/lib/analysis/types";
import type { SavedGame } from "@/lib/history";
import type { CoachReport } from "@/lib/coach/types";
import {
  MAX_TECH_PLIES,
  MAX_TECH_VARIATIONS,
  focusFromPly,
  pickTurningPoints,
} from "@/lib/analysis/presentation";
import { cap, normalizeReport, toMistakes } from "@/lib/coach/gateway.server";
import type { CoachDigest } from "@/lib/coach/digest";
import { VariationPanel } from "./VariationPanel";
import { CoachPanel } from "./CoachPanel";

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));

const START = new Chess().fen();

function makePly(index: number, label: PlyAnalysis["label"], loss: number): PlyAnalysis {
  return {
    index,
    color: index % 2 === 0 ? "w" : "b",
    san: "Qb3",
    uci: "d1b3",
    fenBefore: START,
    fenAfter: START,
    cpAfter: -120,
    bestUci: "e2e4",
    label,
    loss,
    accuracy: 40,
    weight: 1,
    complexity: 0.4,
    see: 0,
    motifs: ["fork"],
    phase: "middlegame",
    variations: [
      {
        uci: "e2e4",
        san: "e4",
        pvSan: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6"],
        cp: 349,
        mateIn: null,
        depth: 18,
      },
      {
        uci: "d2d4",
        san: "d4",
        pvSan: ["d4", "d5", "c4", "e6"],
        cp: 120,
        mateIn: null,
        depth: 18,
      },
      {
        uci: "g1f3",
        san: "Nf3",
        pvSan: ["Nf3", "d5"],
        cp: 40,
        mateIn: null,
        depth: 18,
      },
    ],
    playedPvSan: ["Qb3", "Qxc4"],
  };
}

function makeGame(plies: PlyAnalysis[], coach?: CoachReport): SavedGame {
  return {
    id: "g1",
    playedAt: new Date().toISOString(),
    mode: "ai",
    variant: "standard",
    variantName: "Cờ vua tiêu chuẩn",
    timeControl: "10+0",
    startFen: START,
    finalFen: START,
    moves: [],
    result: { winner: "b", reason: "checkmate" } as SavedGame["result"],
    playerColor: "w",
    white: { name: "Bạn" },
    black: { name: "Bot" },
    opening: null,
    review: {
      evals: [],
      startEval: 0,
      accuracy: { w: 70, b: 80 },
      reviewedAt: "2026-01-01T00:00:00.000Z",
      depth: "deep",
      plies,
    },
    ...(coach ? { coach } : {}),
  } as SavedGame;
}

/** Ten white mistakes of varying severity. */
const TEN_MISTAKES = Array.from({ length: 10 }, (_, i) =>
  makePly(i * 2, i < 3 ? "blunder" : i < 6 ? "miss" : "mistake", 40 - i * 2),
);

beforeEach(() => cleanup());

describe("turning point selection", () => {
  it("keeps at most three turning points out of ten mistakes", () => {
    expect(pickTurningPoints(TEN_MISTAKES, "w")).toHaveLength(3);
  });

  it("prefers missed wins and blunders over plain mistakes", () => {
    const picked = pickTurningPoints(TEN_MISTAKES, "w");
    expect(picked.every((p) => p.severity === "missedWin" || p.severity === "bigMistake")).toBe(
      true,
    );
  });

  it("ignores the opponent's moves", () => {
    expect(pickTurningPoints(TEN_MISTAKES, "b")).toHaveLength(0);
  });

  it("only produces an arrow for a legal engine move", () => {
    const ply = makePly(0, "blunder", 30);
    expect(focusFromPly(ply)).toEqual({ plyIndex: 0, from: "e2", to: "e4" });
    const bogus = { ...ply, variations: [{ ...ply.variations![0]!, uci: "zz99" }], bestUci: null };
    expect(focusFromPly(bogus)).toBeNull();
  });
});

describe("VariationPanel default layer", () => {
  const game = makeGame(TEN_MISTAKES);

  it("shows three cards and no long PV string by default", () => {
    const { container } = render(
      <VariationPanel game={game} onSelectMove={() => {}} focus={null} onFocus={() => {}} />,
    );
    expect(screen.getAllByText(/Bước ngoặt/)).toHaveLength(3);
    const text = container.textContent ?? "";
    expect(text).not.toContain("Bb5 a6 Ba4 Nf6");
    expect(text).not.toContain("d18");
    expect(text).not.toContain("+3.49");
    expect(container.querySelector(".max-h-\\[420px\\]")).toBeNull();
  });

  it("reveals bounded engine data only after opening the technical layer", () => {
    const { container } = render(
      <VariationPanel game={game} onSelectMove={() => {}} focus={null} onFocus={() => {}} />,
    );
    const toggle = screen.getAllByText("Xem chi tiết kỹ thuật")[0]!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    const text = container.textContent ?? "";
    expect(text).toContain("+3.49");
    expect(text).toContain("độ sâu 18");
    // at most two lines, four plies each
    expect(screen.getAllByText(/^Phương án/)).toHaveLength(MAX_TECH_VARIATIONS);
    expect(text).toContain("e4 e5 Nf3 Nc6");
    expect(text).not.toContain("e4 e5 Nf3 Nc6 Bb5");
    expect(MAX_TECH_PLIES).toBe(4);
  });

  it("jumps to the position before the mistake when showing on board", () => {
    const onFocus = vi.fn();
    render(
      <VariationPanel game={game} onSelectMove={() => {}} focus={null} onFocus={onFocus} />,
    );
    fireEvent.click(screen.getAllByText("Xem trên bàn")[0]!);
    expect(onFocus).toHaveBeenCalledWith({ plyIndex: 0, from: "e2", to: "e4" });
  });

  it("uses Vietnamese motif wording, never the English engine label", () => {
    const { container } = render(
      <VariationPanel game={game} onSelectMove={() => {}} focus={null} onFocus={() => {}} />,
    );
    expect(container.textContent).toContain("đòn đôi");
    expect(container.textContent).not.toContain("Fork");
  });

  it("shows a positive message when there is no serious mistake", () => {
    const clean = makeGame([makePly(0, "good", 1)]);
    render(<VariationPanel game={clean} onSelectMove={() => {}} focus={null} onFocus={() => {}} />);
    expect(screen.getByText(/chơi chắc tay/)).toBeTruthy();
  });
});

const REPORT: CoachReport = {
  createdAt: "2026-01-02T00:00:00.000Z",
  side: "w",
  sourceReviewedAt: "2026-01-01T00:00:00.000Z",
  headline: "Ván đấu đổi chiều ở trung cuộc",
  verdict: "Bạn chơi khai cuộc ổn.",
  levelImpression: "Ước lượng từ một ván.",
  phases: { opening: "Phát triển tốt.", middlegame: "Mất tập trung.", endgame: "" },
  strengths: ["Ra quân nhanh"],
  mistakes: [
    {
      momentId: "ply-0",
      plyIndex: 0,
      moveNumber: 1,
      san: "Qb3",
      severity: "critical",
      title: "Bỏ quên quân",
      whatHappened: "Bạn để một quân không được bảo vệ.",
      betterPlan: "Kiểm tra quân bị tấn công trước khi đi.",
    },
  ],
  habits: ["Đi quá nhanh"],
  advice: ["Đếm quân trước khi đi"],
  drills: ["Đòn đôi"],
};

describe("CoachPanel layout", () => {
  it("renders phases as tabs, never a three-column grid", () => {
    const { container } = render(<CoachPanel game={makeGame(TEN_MISTAKES, REPORT)} />);
    expect(container.querySelector(".sm\\:grid-cols-3")).toBeNull();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(3);
  });

  it("explains a missing endgame note naturally", () => {
    render(<CoachPanel game={makeGame(TEN_MISTAKES, REPORT)} />);
    fireEvent.click(screen.getByText("Tàn cuộc"));
    expect(screen.getByText(/kết thúc trước khi bước vào tàn cuộc/)).toBeTruthy();
  });

  it("flags a report generated from older engine data", () => {
    const game = makeGame(TEN_MISTAKES, REPORT);
    game.review!.reviewedAt = "2026-05-05T00:00:00.000Z";
    render(<CoachPanel game={game} />);
    expect(screen.getByText(/lần phân tích trước/)).toBeTruthy();
    expect(screen.getByText("Cập nhật giải thích")).toBeTruthy();
  });

  it("renders a legacy report without plyIndex/sourceReviewedAt", () => {
    const legacy = {
      ...REPORT,
      sourceReviewedAt: undefined,
      mistakes: [{ moveNumber: 3, san: "Qb3", severity: "serious", title: "Cũ", whatHappened: "", betterPlan: "" }],
    } as unknown as CoachReport;
    render(<CoachPanel game={makeGame(TEN_MISTAKES, legacy)} />);
    expect(screen.getByText("Cũ")).toBeTruthy();
  });

  it("does not call the AI automatically", () => {
    render(<CoachPanel game={makeGame(TEN_MISTAKES)} />);
    expect(screen.getByText("Phân tích với chuyên gia AI")).toBeTruthy();
  });
});

describe("coach gateway hardening", () => {
  const digest = {
    side: "w",
    reviewedAt: "2026-01-01T00:00:00.000Z",
    keyMoments: [
      {
        id: "ply-24",
        plyIndex: 24,
        moveNumber: 13,
        san: "Qb3",
        label: "Sai lầm",
        lossPct: 30,
        bestMove: "e2e4",
        evalAfter: "-1.20",
        phase: "middlegame",
        motifs: [],
      },
    ],
  } as unknown as CoachDigest;

  it("drops forged moment ids and takes SAN from the digest", () => {
    const mistakes = toMistakes(
      [
        { momentId: "ply-999", title: "Bịa", whatHappened: "", betterPlan: "", severity: "critical" },
        {
          momentId: "ply-24",
          title: "Thật",
          whatHappened: "x",
          betterPlan: "y",
          severity: "serious",
          moveNumber: 99,
          san: "Qxh7#",
        },
      ],
      digest.keyMoments,
    );
    expect(mistakes).toHaveLength(1);
    expect(mistakes[0]!.moveNumber).toBe(13);
    expect(mistakes[0]!.san).toBe("Qb3");
    expect(mistakes[0]!.plyIndex).toBe(24);
  });

  it("removes duplicate moments and caps the list at four", () => {
    const many = Array.from({ length: 8 }, () => ({
      momentId: "ply-24",
      title: "T",
      whatHappened: "",
      betterPlan: "",
      severity: "basic",
    }));
    expect(toMistakes(many, digest.keyMoments)).toHaveLength(1);
  });

  it("truncates overlong output safely", () => {
    const long = "a".repeat(2000);
    const report = normalizeReport(
      {
        headline: long,
        verdict: long,
        phases: { opening: long, middlegame: long, endgame: long },
        strengths: [long, long, long, long, long],
        habits: [long, long, long, long],
        advice: [long, long, long, long],
        drills: [long, long, long, long],
        mistakes: [],
      },
      digest,
      "vi",
    );
    expect(report.headline.length).toBeLessThanOrEqual(91);
    expect(report.verdict.length).toBeLessThanOrEqual(451);
    expect(report.strengths).toHaveLength(3);
    expect(report.advice).toHaveLength(3);
    expect(report.drills).toHaveLength(3);
    expect(report.sourceReviewedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(cap("short", 100)).toBe("short");
  });
});
