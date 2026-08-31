import { describe, it, expect } from "vitest";
import { compareWhatIf, judgeRetry, moveToSan, retryHints } from "./whatif";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("retry lab", () => {
  it("accepts the engine move as solved", () => {
    const r = judgeRetry({ fen: START, bestUci: "e2e4", tryUci: "e2e4", bestWin: 55, tryWin: 55 });
    expect(r.verdict).toBe("solved");
    expect(r.san).toBe("e4");
  });

  it("accepts an equally strong alternative", () => {
    const r = judgeRetry({ fen: START, bestUci: "e2e4", tryUci: "d2d4", bestWin: 55, tryWin: 54 });
    expect(r.verdict).toBe("alsoGood");
  });

  it("grades a weaker try", () => {
    const r = judgeRetry({ fen: START, bestUci: "e2e4", tryUci: "a2a3", bestWin: 55, tryWin: 40 });
    expect(r.verdict).toBe("worse");
    expect(r.loss).toBe(15);
  });

  it("rejects illegal moves without penalty", () => {
    const r = judgeRetry({ fen: START, bestUci: "e2e4", tryUci: "e2e5", bestWin: 55, tryWin: 0 });
    expect(r.verdict).toBe("illegal");
    expect(r.loss).toBe(0);
  });

  it("reveals hints progressively", () => {
    expect(retryHints("e2e4", ["Fork"])).toEqual(["Fork", "e2"]);
  });
});

describe("what-if lab", () => {
  it("marks a stronger candidate as better", () => {
    const c = compareWhatIf(START, "e2e4", 120, 10);
    expect(c?.verdict).toBe("better");
    expect(c?.san).toBe("e4");
  });

  it("marks a near-identical candidate as similar", () => {
    const c = compareWhatIf(START, "d2d4", 30, 28);
    expect(c?.verdict).toBe("similar");
  });

  it("returns null for an illegal candidate", () => {
    expect(compareWhatIf(START, "e2e5", 100, 0)).toBeNull();
    expect(moveToSan(START, "zz")).toBeNull();
  });
});
