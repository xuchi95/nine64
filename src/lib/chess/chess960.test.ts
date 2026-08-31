import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  backRankForIndex,
  generateChess960Fen,
  generateChess960Position,
  indexForBackRank,
} from "./chess960";

const STANDARD_BACK_RANK = "rnbqkbnr";

function isLightSquare(file: number): boolean {
  // a1 (file 0) is dark on the first rank.
  return file % 2 === 1;
}

describe("Chess960 generator", () => {
  it("produces 960 distinct, legal back ranks", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 960; index += 1) {
      const pos = generateChess960Position(index);
      expect(pos.index).toBe(index);
      const rank = pos.backRank;
      expect(rank).toHaveLength(8);
      seen.add(rank);

      const counts: Record<string, number> = {};
      [...rank].forEach((p) => (counts[p] = (counts[p] ?? 0) + 1));
      expect(counts["k"]).toBe(1);
      expect(counts["q"]).toBe(1);
      expect(counts["r"]).toBe(2);
      expect(counts["b"]).toBe(2);
      expect(counts["n"]).toBe(2);

      const bishops = [...rank].flatMap((p, i) => (p === "b" ? [i] : []));
      expect(bishops).toHaveLength(2);
      expect(isLightSquare(bishops[0]!)).not.toBe(isLightSquare(bishops[1]!));

      const king = rank.indexOf("k");
      expect(king).toBeGreaterThan(rank.indexOf("r"));
      expect(king).toBeLessThan(rank.lastIndexOf("r"));

      expect(indexForBackRank(rank)).toBe(index);
      expect(backRankForIndex(index)).toBe(rank);
    }
    expect(seen.size).toBe(960);
  });

  it("mirrors white and black and round-trips through a FEN parser", () => {
    for (let index = 0; index < 960; index += 1) {
      const { fen, backRank } = generateChess960Position(index);
      const [black, blackPawns, , , , , whitePawns, white] = fen.split(" ")[0]!.split("/");
      expect(black).toBe(backRank);
      expect(white).toBe(backRank.toUpperCase());
      expect(blackPawns).toBe("pppppppp");
      expect(whitePawns).toBe("PPPPPPPP");
      expect(fen.split(" ")[1]).toBe("w");
    }
  });

  it("maps the standard array to its canonical index", () => {
    expect(backRankForIndex(518)).toBe(STANDARD_BACK_RANK);
    expect(indexForBackRank(STANDARD_BACK_RANK)).toBe(518);
    const standard = generateChess960Position(518);
    expect(new Chess(standard.fen).fen()).toBe(new Chess().fen());
  });

  it("rejects out-of-range indices and returns a random valid one by default", () => {
    expect(() => generateChess960Position(-1)).toThrow();
    expect(() => generateChess960Position(960)).toThrow();
    for (let i = 0; i < 50; i += 1) {
      const fen = generateChess960Fen();
      expect(indexForBackRank(fen.split(" ")[0]!.split("/")[0]!)).toBeGreaterThanOrEqual(0);
    }
  });

  it("exposes castling metadata consistent with the back rank", () => {
    for (let index = 0; index < 960; index += 1) {
      const { backRank, castlingMetadata, shredderFen } = generateChess960Position(index);
      expect(castlingMetadata.kingFile).toBe(backRank.indexOf("k"));
      expect(castlingMetadata.kingsideRookFile).toBe(backRank.lastIndexOf("r"));
      expect(castlingMetadata.queensideRookFile).toBe(backRank.indexOf("r"));
      expect(shredderFen).toContain(" w ");
      expect(castlingMetadata.shredder).toHaveLength(4);
    }
  });
});
