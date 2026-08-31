import { describe, expect, it } from "vitest";
import { buildWeeklyReport } from "./weekly";
import type { BrainEvent } from "./profile";

const NOW = new Date("2026-08-31T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function make(n: number, partial: Partial<BrainEvent>): BrainEvent[] {
  return Array.from({ length: n }, () => ({
    skillKey: "fork",
    outcome: "negative",
    source: "review",
    createdAt: daysAgo(1),
    ...partial,
  })) as BrainEvent[];
}

describe("weekly report", () => {
  it("marks a thin week as low data", () => {
    const report = buildWeeklyReport({ events: [], games: [], sessions: [], now: NOW });
    expect(report.lowData).toBe(true);
    expect(report.improved).toEqual([]);
    expect(report.declining).toEqual([]);
  });

  it("detects improvement and decline against the previous week", () => {
    const events = [
      ...make(10, { skillKey: "pin", createdAt: daysAgo(10) }),
      ...make(10, { skillKey: "pin", outcome: "positive", label: "best", createdAt: daysAgo(2) }),
      ...make(10, { skillKey: "conversion", outcome: "positive", createdAt: daysAgo(10) }),
      ...make(10, { skillKey: "conversion", createdAt: daysAgo(2) }),
    ];
    const report = buildWeeklyReport({ events, games: [], sessions: [], now: NOW });
    expect(report.improved.some((s) => s.key === "tactics")).toBe(true);
    expect(report.declining.some((s) => s.key === "endgame")).toBe(true);
  });

  it("lists recurring mistakes and the opening leak", () => {
    const events = [
      ...make(4, { skillKey: "opening_principles", createdAt: daysAgo(2) }),
      ...make(3, { skillKey: "pin", createdAt: daysAgo(3) }),
    ];
    const report = buildWeeklyReport({ events, games: [], sessions: [], now: NOW });
    expect(report.recurringMistakes[0]).toEqual({ skillKey: "opening_principles", count: 4 });
    expect(report.openingLeak?.skillKey).toBe("opening_principles");
    expect(report.recommendedFocus.length).toBeGreaterThan(0);
  });

  it("aggregates activity from sessions and games", () => {
    const report = buildWeeklyReport({
      events: make(12, { createdAt: daysAgo(1) }),
      games: [
        { id: "a", endedAt: daysAgo(1), result: "win" },
        { id: "b", endedAt: daysAgo(2), result: "loss" },
        { id: "c", endedAt: daysAgo(20), result: "win" },
      ],
      sessions: [
        { date: "2026-08-30", minutes: 20, completedBlocks: 4, failedBlocks: 1 },
        { date: "2026-08-01", minutes: 30, completedBlocks: 5, failedBlocks: 0 },
      ],
      now: NOW,
    });
    expect(report.activity.games).toBe(2);
    expect(report.activity.wins).toBe(1);
    expect(report.activity.sessions).toBe(1);
    expect(report.activity.minutes).toBe(20);
    expect(report.activity.failedBlocks).toBe(1);
  });
});
