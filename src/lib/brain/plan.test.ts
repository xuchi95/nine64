import { describe, expect, it } from "vitest";
import { generateDailyPlan, isFatigued, type PlanContext } from "./plan";
import { buildPlayerProfile, type BrainEvent } from "./profile";

const NOW = new Date("2026-08-31T12:00:00.000Z");

function events(): BrainEvent[] {
  return [
    ...Array.from({ length: 14 }, () => ({
      skillKey: "conversion" as const,
      outcome: "negative" as const,
      source: "review",
      createdAt: NOW.toISOString(),
      label: "mistake",
    })),
    ...Array.from({ length: 14 }, () => ({
      skillKey: "fork" as const,
      outcome: "positive" as const,
      source: "review",
      createdAt: NOW.toISOString(),
      label: "best",
    })),
  ];
}

function ctx(overrides: Partial<PlanContext> = {}): PlanContext {
  return {
    profile: buildPlayerProfile({ events: events(), now: NOW }),
    dueCards: 0,
    retryCandidates: [],
    rating: 1500,
    budget: 20,
    fatigue: { recentSessions: 1, recentFailures: 0, streakDays: 1 },
    date: "2026-08-31",
    ...overrides,
  };
}

describe("adaptive daily plan", () => {
  it("fills exactly the chosen budget", () => {
    for (const budget of [10, 20, 30, 45] as const) {
      const plan = generateDailyPlan(ctx({ budget }));
      expect(plan.totalMinutes).toBe(budget);
      expect(plan.blocks.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic for the same inputs", () => {
    expect(JSON.stringify(generateDailyPlan(ctx()))).toBe(JSON.stringify(generateDailyPlan(ctx())));
  });

  it("prioritises due FSRS cards", () => {
    const plan = generateDailyPlan(ctx({ dueCards: 12 }));
    expect(plan.blocks[0]!.kind).toBe("srs_review");
    expect(plan.blocks[0]!.reason.code).toBe("srs_due");
    expect(plan.blocks[0]!.reason.params['count']).toBe(12);
  });

  it("targets the weakest dimension and explains why", () => {
    const plan = generateDailyPlan(ctx({ budget: 30 }));
    const targeted = plan.blocks.find((b) => b.targetDimension);
    expect(targeted).toBeTruthy();
    expect(["weakest_skill", "low_confidence_probe"]).toContain(targeted!.reason.code);
    expect(plan.focus.length).toBeGreaterThan(0);
  });

  it("adds a retry block when a recent mistake exists", () => {
    const plan = generateDailyPlan(
      ctx({ budget: 45, retryCandidates: [{ gameId: "g1", ply: 24, label: "blunder" }] }),
    );
    const retry = plan.blocks.find((b) => b.kind === "retry");
    expect(retry?.reason.code).toBe("recent_mistake");
    expect(retry?.reason.params['gameId']).toBe("g1");
  });

  it("drops the bot challenge and eases difficulty when fatigued", () => {
    const fatigue = { recentSessions: 4, recentFailures: 4, streakDays: 7 };
    expect(isFatigued(fatigue)).toBe(true);
    const plan = generateDailyPlan(ctx({ budget: 30, fatigue }));
    expect(plan.fatigueAdjusted).toBe(true);
    expect(plan.blocks.some((b) => b.kind === "bot_challenge")).toBe(false);
    expect(plan.blocks.every((b) => b.difficulty === "easy")).toBe(true);
  });

  it("scales difficulty with rating", () => {
    const strong = generateDailyPlan(ctx({ rating: 2000, budget: 45 }));
    expect(strong.blocks.some((b) => b.difficulty === "hard")).toBe(true);
  });
});
