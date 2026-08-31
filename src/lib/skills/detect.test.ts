import { describe, it, expect } from "vitest";
import { detectSkillEvents, skillsForPly } from "./detect";
import type { PlyAnalysis } from "@/lib/analysis/types";

const base: PlyAnalysis = {
  index: 10,
  color: "w",
  san: "Nf3",
  uci: "g1f3",
  fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  fenAfter: "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1",
  cpAfter: 20,
  bestUci: "g1f3",
  label: "best",
  loss: 0,
  accuracy: 99,
  weight: 1,
  complexity: 0.2,
  see: 0,
  motifs: [],
  phase: "opening",
};

describe("skill detection", () => {
  it("credits a tactical motif to its skill", () => {
    const events = skillsForPly({ ...base, motifs: ["fork"], label: "great" });
    expect(events.some((e) => e.key === "fork" && e.outcome === "positive")).toBe(true);
  });

  it("penalises a blunder that hangs material", () => {
    const events = skillsForPly({
      ...base,
      label: "blunder",
      loss: 40,
      see: -300,
      san: "Nd4",
    });
    expect(events.some((e) => e.key === "piece_safety" && e.outcome === "negative")).toBe(true);
  });

  it("drops neutral plies entirely", () => {
    const events = skillsForPly({ ...base, label: "good", loss: 3, san: "a3" });
    expect(events.every((e) => e.outcome !== "neutral")).toBe(true);
  });

  it("produces stable, deduplicated event keys", () => {
    const plies = [base, { ...base, index: 12, motifs: ["pin" as const], label: "great" as const }];
    const a = detectSkillEvents({ gameId: "g1", plies, perspective: "w" });
    const b = detectSkillEvents({ gameId: "g1", plies, perspective: "w" });
    expect(a.map((e) => e.eventKey)).toEqual(b.map((e) => e.eventKey));
    expect(new Set(a.map((e) => e.eventKey)).size).toBe(a.length);
  });

  it("ignores the opponent's plies when a perspective is given", () => {
    const events = detectSkillEvents({
      gameId: "g1",
      plies: [{ ...base, color: "b", motifs: ["fork"], label: "great" }],
      perspective: "w",
    });
    expect(events).toHaveLength(0);
  });
});
