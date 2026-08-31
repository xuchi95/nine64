import { describe, expect, it } from "vitest";
import { buildPlayerProfile, dimension, weakestDimensions, type BrainEvent } from "./profile";
import { DIMENSION_KEYS } from "./dimensions";

const NOW = new Date("2026-08-31T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function ev(partial: Partial<BrainEvent>): BrainEvent {
  return {
    skillKey: "fork",
    outcome: "negative",
    source: "review",
    createdAt: daysAgo(1),
    ...partial,
  } as BrainEvent;
}

describe("player profile", () => {
  it("returns all 13 dimensions with neutral defaults when empty", () => {
    const profile = buildPlayerProfile({ events: [], now: NOW });
    expect(profile.dimensions.map((d) => d.key)).toEqual(DIMENSION_KEYS);
    for (const d of profile.dimensions) {
      expect(d.score).toBe(50);
      expect(d.confidence).toBe(0);
      expect(d.sample).toBe(0);
      expect(d.trend).toBe("unknown");
    }
  });

  it("never reports a strong score from a single event", () => {
    const profile = buildPlayerProfile({ events: [ev({ outcome: "positive" })], now: NOW });
    const tactics = dimension(profile, "tactics");
    expect(tactics.score).toBeLessThan(70);
    expect(tactics.confidence).toBeLessThan(20);
  });

  it("scores a consistently failing dimension low with real confidence", () => {
    const events = Array.from({ length: 30 }, () => ev({ skillKey: "pin" }));
    const profile = buildPlayerProfile({ events, now: NOW });
    const tactics = dimension(profile, "tactics");
    expect(tactics.score).toBeLessThan(20);
    expect(tactics.confidence).toBeGreaterThan(55);
    expect(tactics.sample).toBe(30);
  });

  it("inverts blunder frequency: fewer blunders = higher score", () => {
    const clean = buildPlayerProfile({
      events: Array.from({ length: 40 }, () => ev({ outcome: "positive", label: "best" })),
      now: NOW,
    });
    const messy = buildPlayerProfile({
      events: Array.from({ length: 40 }, (_, i) => ev({ label: i % 4 === 0 ? "blunder" : "best" })),
      now: NOW,
    });
    expect(dimension(clean, "blunder_frequency").score).toBe(100);
    expect(dimension(messy, "blunder_frequency").score).toBe(0);
  });

  it("computes trend from the last 14 days versus the previous 14", () => {
    const events = [
      ...Array.from({ length: 10 }, () => ev({ skillKey: "pin", createdAt: daysAgo(20) })),
      ...Array.from({ length: 10 }, () =>
        ev({ skillKey: "pin", outcome: "positive", createdAt: daysAgo(3) }),
      ),
    ];
    const profile = buildPlayerProfile({ events, now: NOW });
    expect(dimension(profile, "tactics").trend).toBe("up");
  });

  it("ranks weakest dimensions with evidence first", () => {
    const events = [
      ...Array.from({ length: 12 }, () => ev({ skillKey: "conversion" })),
      ...Array.from({ length: 12 }, () => ev({ skillKey: "fork", outcome: "positive", label: "best" })),
    ];
    const weakest = weakestDimensions(buildPlayerProfile({ events, now: NOW }));
    expect(weakest[0]!.score).toBeLessThan(50);
    expect(weakest.every((d) => d.sample > 0)).toBe(true);
  });
});
