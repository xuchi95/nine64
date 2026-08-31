import { describe, it, expect } from "vitest";
import { buildHighlights } from "./highlights";
import type { PlyAnalysis } from "./types";

function ply(p: Partial<PlyAnalysis>): PlyAnalysis {
  return {
    index: 0,
    color: "w",
    san: "e4",
    uci: "e2e4",
    fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    cpAfter: 20,
    bestUci: "e2e4",
    label: "best",
    loss: 0,
    accuracy: 98,
    weight: 1,
    complexity: 0.3,
    see: 0,
    motifs: [],
    phase: "opening",
    ...p,
  };
}

describe("game highlights", () => {
  it("summarises accuracy and label counts for one colour only", () => {
    const h = buildHighlights(
      [
        ply({ index: 0 }),
        ply({ index: 1, color: "b", label: "blunder", loss: 50, accuracy: 10 }),
      ],
      "w",
    );
    expect(h.counts.blunder).toBe(0);
    expect(h.accuracy).toBe(98);
  });

  it("names the biggest missed opportunity", () => {
    const h = buildHighlights(
      [
        ply({ index: 0 }),
        ply({ index: 2, label: "mistake", loss: 12, accuracy: 40, san: "Nc3" }),
        ply({ index: 4, label: "blunder", loss: 45, accuracy: 5, san: "Qh5" }),
      ],
      "w",
    );
    expect(h.biggestMiss?.san).toBe("Qh5");
    expect(h.improvements[0]?.kind).toBe("worstMove");
  });

  it("caps each list at three items", () => {
    const plies = Array.from({ length: 12 }, (_, i) =>
      ply({ index: i * 2, label: "blunder", loss: 30 + i, accuracy: 10, see: -200 }),
    );
    const h = buildHighlights(plies, "w");
    expect(h.improvements.length).toBeLessThanOrEqual(3);
    expect(h.strengths.length).toBeLessThanOrEqual(3);
  });

  it("is deterministic", () => {
    const plies = [ply({ index: 0 }), ply({ index: 2, label: "great", accuracy: 95 })];
    expect(buildHighlights(plies, "w")).toEqual(buildHighlights(plies, "w"));
  });
});
