import { describe, expect, it } from "vitest";
import { applyIntent, computeClocks, sideToMoveFromFen } from "./moveEngine";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("applyIntent", () => {
  it("derives canonical SAN/UCI/FEN for a legal move", () => {
    const res = applyIntent(START, "e2", "e4");
    expect(res).not.toBeNull();
    expect(res!.san).toBe("e4");
    expect(res!.uci).toBe("e2e4");
    expect(res!.fen.startsWith("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b")).toBe(true);
    expect(res!.turn).toBe("b");
    expect(res!.isGameOver).toBe(false);
  });

  it("rejects an illegal move", () => {
    expect(applyIntent(START, "e2", "e5")).toBeNull();
    expect(applyIntent(START, "a1", "a8")).toBeNull();
  });

  it("rejects moving the opponent's piece", () => {
    expect(applyIntent(START, "e7", "e5")).toBeNull();
  });

  it("detects checkmate", () => {
    const mate = applyIntent(
      "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",
      "d8",
      "h4",
    );
    expect(mate?.isCheckmate).toBe(true);
    expect(mate?.san).toBe("Qh4#");
  });

  it("handles promotion", () => {
    const res = applyIntent("8/P6k/8/8/8/8/7K/8 w - - 0 1", "a7", "a8", "n");
    expect(res?.san).toBe("a8=N");
    expect(res?.uci).toBe("a7a8n");
  });

  it("detects stalemate as a draw", () => {
    const stale = applyIntent("7k/8/8/8/8/8/8/K5Q1 w - - 0 1", "g1", "g6");
    expect(stale?.isStalemate).toBe(true);
    expect(stale?.isDraw).toBe(true);
  });
});

describe("sideToMoveFromFen", () => {
  it("reads the side to move", () => {
    expect(sideToMoveFromFen(START)).toBe("w");
    expect(sideToMoveFromFen(applyIntent(START, "e2", "e4")!.fen)).toBe("b");
  });
});

describe("computeClocks", () => {
  const base = {
    timeControl: "blitz3m",
    whiteTimeMs: 180_000,
    blackTimeMs: 180_000,
    moverIsWhite: true,
  };

  it("deducts elapsed time and adds the increment for the mover only", () => {
    const out = computeClocks({ ...base, lastMoveAtMs: 1_000, nowMs: 6_000 });
    expect(out.whiteTimeMs).toBe(180_000 - 5_000 + 2_000);
    expect(out.blackTimeMs).toBe(180_000);
    expect(out.flagged).toBe(false);
  });

  it("flags when the mover runs out of time", () => {
    const out = computeClocks({
      ...base,
      whiteTimeMs: 3_000,
      lastMoveAtMs: 0,
      nowMs: 10_000,
    });
    expect(out.flagged).toBe(true);
    expect(out.whiteTimeMs).toBe(0);
  });

  it("does not deduct on the first move of a game", () => {
    const out = computeClocks({ ...base, lastMoveAtMs: null, nowMs: 99_999 });
    expect(out.whiteTimeMs).toBe(182_000);
  });
});
