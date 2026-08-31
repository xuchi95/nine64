import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { StandardRules } from "./rules/StandardRules";

/** Standard move-generation counter used to prove rule correctness. */
function perft(chess: Chess, depth: number): number {
  if (depth === 0) return 1;
  const moves = chess.moves({ verbose: true });
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) {
    chess.move(move);
    nodes += perft(chess, depth - 1);
    chess.undo();
  }
  return nodes;
}

describe("standard rules perft", () => {
  it("matches the known node counts from the initial position", () => {
    const chess = new Chess();
    expect(perft(chess, 1)).toBe(20);
    expect(perft(chess, 2)).toBe(400);
    expect(perft(chess, 3)).toBe(8902);
    expect(perft(chess, 4)).toBe(197281);
  }, 60_000);

  it("keeps the rules adapter in sync with the raw engine", () => {
    const position = StandardRules.createPosition(StandardRules.startingFen());
    expect(position.legalTargets("e2")).toEqual(expect.arrayContaining(["e3", "e4"]));
    const applied = position.move("e2", "e4");
    expect(applied?.san).toBe("e4");
    expect(applied?.uci).toBe("e2e4");
  });

  it("rejects illegal moves and invalid FENs with structured errors", () => {
    expect(() => StandardRules.createPosition("not a fen")).toThrowError(/INVALID_FEN|fen/i);
    expect(StandardRules.validateMove(StandardRules.startingFen(), "e2", "e5")).toBeNull();
  });
});
