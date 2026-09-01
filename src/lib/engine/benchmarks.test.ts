import { describe, expect, it } from "vitest";
import { isLegalBenchmarkMove } from "./benchmarks.server";

describe("bounded Titan benchmark validation", () => {
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("accepts a legal full UCI move", () => {
    expect(isLegalBenchmarkMove(start, "e2e4")).toBe(true);
  });

  it("rejects illegal, malformed and missing moves", () => {
    expect(isLegalBenchmarkMove(start, "e2e5")).toBe(false);
    expect(isLegalBenchmarkMove(start, "bestmove e2e4")).toBe(false);
    expect(isLegalBenchmarkMove(start, null)).toBe(false);
  });

  it("preserves promotion information during validation", () => {
    const promotion = "8/P7/8/8/8/8/7k/7K w - - 0 1";
    expect(isLegalBenchmarkMove(promotion, "a7a8q")).toBe(true);
    expect(isLegalBenchmarkMove(promotion, "a7a8")).toBe(false);
  });
});