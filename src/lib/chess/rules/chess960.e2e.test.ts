import { describe, expect, it } from "vitest";
import { Chess960Rules, canonicalChess960Fen } from "./Chess960Rules";
import { appMoveToEngineUci, engineUciToAppMove } from "./chess960MoveCodec";
import { applyIntent } from "@/lib/online/moveEngine";
import { generateChess960Position } from "@/lib/chess/chess960";

/**
 * End-to-end Chess960 castling contract:
 * app notation (king -> g/c file) <-> engine notation (king -> rook square),
 * through the rules adapter and the server-authoritative move pipeline.
 */

// King on c1/c8, rooks on a/h: queenside castling leaves the king where it is.
const ODD_CASTLE_FEN = "r1k4r/pppppppp/8/8/8/8/PPPPPPPP/R1K4R w KQkq - 0 1";

describe("Chess960 castling", () => {
  it("castles kingside with the king moving to g1 and the rook to f1", () => {
    const move = Chess960Rules.validateMove(ODD_CASTLE_FEN, "c1", "g1");
    expect(move).not.toBeNull();
    expect(move?.castle).toEqual({
      side: "king",
      kingFrom: "c1",
      kingTo: "g1",
      rookFrom: "h1",
      rookTo: "f1",
    });
    // Rook lands on f1, king on g1.
    expect(move?.fen.split(" ")[0]?.split("/")[7]).toBe("R4RK1");
  });

  it("castles queenside even though the king never leaves its square", () => {
    const move = Chess960Rules.validateMove(ODD_CASTLE_FEN, "c1", "c1");
    expect(move).not.toBeNull();
    expect(move?.castle?.side).toBe("queen");
    expect(move?.castle?.rookFrom).toBe("a1");
    expect(move?.castle?.rookTo).toBe("d1");
  });

  it("offers the final king square as a legal target, not the rook square", () => {
    const position = Chess960Rules.createPosition(ODD_CASTLE_FEN);
    const targets = position.legalTargets("c1");
    expect(targets).toContain("g1");
    expect(targets).not.toContain("h1");
  });

  it("round-trips app notation and Stockfish UCI_Chess960 notation", () => {
    expect(appMoveToEngineUci(ODD_CASTLE_FEN, { from: "c1", to: "g1" })).toBe("c1h1");
    expect(appMoveToEngineUci(ODD_CASTLE_FEN, { from: "c1", to: "c1" })).toBe("c1a1");
    expect(engineUciToAppMove(ODD_CASTLE_FEN, "c1h1")).toEqual({ from: "c1", to: "g1" });
    expect(engineUciToAppMove(ODD_CASTLE_FEN, "c1a1")).toEqual({ from: "c1", to: "c1" });
    // Non-castling moves pass through untouched.
    expect(engineUciToAppMove(ODD_CASTLE_FEN, "d2d4")).toEqual({ from: "d2", to: "d4" });
  });

  it("stores a castle as king-start -> king-final in the online pipeline", () => {
    const applied = applyIntent("chess960", ODD_CASTLE_FEN, "c1", "g1");
    expect(applied).not.toBeNull();
    expect(applied?.uci).toBe("c1g1");
    expect(applied?.san).toMatch(/^O-O/);
    expect(applied?.turn).toBe("b");
  });

  it("rejects an illegal castle instead of silently accepting it", () => {
    // Blocked: a piece sits between the king and its destination.
    const blocked = "r1k4r/pppppppp/8/8/8/8/PPPPPPPP/R1K3NR w KQkq - 0 1";
    expect(Chess960Rules.validateMove(blocked, "c1", "g1")).toBeNull();
  });

  it("keeps generated start positions canonical through the rule engine", () => {
    for (let index = 0; index < 960; index += 97) {
      const fen = generateChess960Position(index);
      expect(() => canonicalChess960Fen(fen)).not.toThrow();
      const position = Chess960Rules.createPosition(fen);
      expect(position.turn()).toBe("w");
      expect(position.legalMoves().length).toBeGreaterThan(0);
    }
  });
});
