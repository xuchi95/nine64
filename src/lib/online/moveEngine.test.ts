import { describe, expect, it } from "vitest";
import { applyIntent,  sideToMoveFromFen } from "./moveEngine";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("applyIntent", () => {
  it("derives canonical SAN/UCI/FEN for a legal move", () => {
    const res = applyIntent("standard", START, "e2", "e4");
    expect(res).not.toBeNull();
    expect(res!.san).toBe("e4");
    expect(res!.uci).toBe("e2e4");
    expect(res!.fen.startsWith("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b")).toBe(true);
    expect(res!.turn).toBe("b");
    expect(res!.isGameOver).toBe(false);
  });

  it("rejects an illegal move", () => {
    expect(applyIntent("standard", START, "e2", "e5")).toBeNull();
    expect(applyIntent("standard", START, "a1", "a8")).toBeNull();
  });

  it("rejects moving the opponent's piece", () => {
    expect(applyIntent("standard", START, "e7", "e5")).toBeNull();
  });

  it("detects checkmate", () => {
    const mate = applyIntent("standard", "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",
      "d8",
      "h4",
    );
    expect(mate?.isCheckmate).toBe(true);
    expect(mate?.san).toBe("Qh4#");
  });

  it("handles promotion", () => {
    const res = applyIntent("standard", "8/P6k/8/8/8/8/7K/8 w - - 0 1", "a7", "a8", "n");
    expect(res?.san).toBe("a8=N");
    expect(res?.uci).toBe("a7a8n");
  });

  it("detects stalemate as a draw", () => {
    const stale = applyIntent("standard", "7k/8/8/8/8/8/8/K5Q1 w - - 0 1", "g1", "g6");
    expect(stale?.isStalemate).toBe(true);
    expect(stale?.isDraw).toBe(true);
  });
});

describe("sideToMoveFromFen", () => {
  it("reads the side to move", () => {
    expect(sideToMoveFromFen(START)).toBe("w");
    expect(sideToMoveFromFen(applyIntent("standard", START, "e2", "e4")!.fen)).toBe("b");
  });
});
