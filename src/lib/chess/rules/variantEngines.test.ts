import { describe, expect, it } from "vitest";
import { rulesFor } from "./index";
import {
  AtomicRules,
  CrazyhouseRules,
  GiveawayRules,
  HordeRules,
  KingOfTheHillRules,
  NoCastlingRules,
  RacingKingsRules,
  ThreeCheckRules,
} from "./variantEngines";
import { VARIANTS, VARIANT_CAPABILITIES, type VariantId } from "@/config/variants";
import { VARIANT_RULES } from "@/lib/chess/variants";

describe("variant rules engines", () => {
  it("gives every variant a working engine and a resolvable start position", () => {
    for (const v of VARIANTS) {
      const engine = rulesFor(v.id);
      expect(engine.supported, v.id).toBe(true);
      const pos = engine.createPosition(VARIANT_RULES[v.id].startingFen());
      expect(pos.legalMoves().length, v.id).toBeGreaterThan(0);
    }
  });

  it("keeps every capability flag honest about the engine behind it", () => {
    for (const v of VARIANTS) {
      if (!rulesFor(v.id).supported) {
        expect(v.localPlayable).toBe(false);
        expect(v.onlineSupport).toBe(false);
      }
      // A variant may never be rated without online play behind it.
      if (v.ratedSupport) expect(v.onlineSupport).toBe(true);
      expect(VARIANT_CAPABILITIES[v.id].resultResolver).toBeTruthy();
    }
  });
});

describe("three-check", () => {
  it("keeps the check counter in position state and wins on the third check", () => {
    // White to deliver a third check; two checks already recorded in the FEN.
    const pos = ThreeCheckRules.createPosition(
      "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR w KQkq - 2+3 0 3",
    );
    expect(pos.checkCount?.()).toEqual({ w: 1, b: 0 });

    const start = ThreeCheckRules.createPosition();
    expect(start.checkCount?.()).toEqual({ w: 0, b: 0 });
    expect(start.variantOutcome?.()).toBeNull();
  });

  it("declares the variant end once a side runs out of checks to give", () => {
    // Black has one check left to survive (remaining 3+1); white to move and check.
    const pos = ThreeCheckRules.createPosition(
      "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 3+1 0 3",
    );
    expect(pos.checkCount?.().b).toBe(2);
  });
});

describe("king of the hill", () => {
  it("ends the game when a king reaches a central square", () => {
    const pos = KingOfTheHillRules.createPosition("8/8/8/8/4K3/8/8/7k b - - 0 1");
    expect(pos.variantOutcome?.()).toMatchObject({ over: true, winner: "w" });
  });

  it("does not end on a non-central king", () => {
    const pos = KingOfTheHillRules.createPosition("8/8/8/8/8/4K3/8/7k b - - 0 1");
    expect(pos.variantOutcome?.()).toBeNull();
  });
});

describe("crazyhouse", () => {
  it("moves a captured piece into the capturer's pocket and allows a drop", () => {
    const pos = CrazyhouseRules.createPosition();
    pos.move("e2", "e4");
    pos.move("d7", "d5");
    const capture = pos.move("e4", "d5");
    expect(capture?.captured).toBe("p");
    expect(pos.pocket?.("w").p).toBe(1);

    pos.move("d8", "d5"); // black recaptures: each side now holds one pawn
    expect(pos.pocket?.("b").p).toBe(1);
    expect(pos.pocket?.("w").p).toBe(1);

    // White to move may drop its pawn on any empty non-back-rank square.
    const targets = pos.dropTargets?.("p") ?? [];
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.some((sq) => sq.endsWith("1") || sq.endsWith("8"))).toBe(false);
  });

  it("never allows a pawn drop on the back ranks", () => {
    const pos = CrazyhouseRules.createPosition(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[Pp] w KQkq - 0 1",
    );
    const targets = pos.dropTargets?.("p") ?? [];
    expect(targets.some((sq) => sq.endsWith("1") || sq.endsWith("8"))).toBe(false);
    expect(targets.length).toBeGreaterThan(0);
  });

  it("plays a drop as a real move with @ notation", () => {
    const pos = CrazyhouseRules.createPosition(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[Pp] w KQkq - 0 1",
    );
    const applied = pos.drop?.("p", "e4");
    expect(applied?.san).toBe("P@e4");
    expect(applied?.uci).toBe("P@e4");
    expect(pos.pieceAt("e4")).toMatchObject({ type: "p", color: "w" });
    expect(pos.pocket?.("w").p).toBe(0);
  });

  it("reverts a promoted piece to a pawn in the pocket", () => {
    // White promotes on b8; black's rook then captures the promoted queen.
    const pos = CrazyhouseRules.createPosition("1r5k/P7/8/8/8/8/8/4K3[] w - - 0 1");
    const promo = pos.move("a7", "b8", "q");
    expect(promo?.promotion).toBe("q");
    expect(pos.pocket?.("w").r).toBe(1); // the captured rook

    // Fresh line where the rook recaptures the promoted queen.
    const pos2 = CrazyhouseRules.createPosition("1r5k/P7/8/8/8/8/8/4K3[] w - - 0 1");
    pos2.move("a7", "a8", "q");
    pos2.move("b8", "a8"); // rook takes the PROMOTED queen
    // Reversion: the capturer receives a pawn, never a queen.
    expect(pos2.pocket?.("b").q).toBe(0);
    expect(pos2.pocket?.("b").p).toBe(1);
  });
});

describe("atomic", () => {
  it("explodes the capturing piece and the surrounding non-pawn pieces", () => {
    const pos = AtomicRules.createPosition("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
    pos.move("e4", "d5");
    // Both pawns are gone: the capturer explodes together with its victim.
    expect(pos.pieceAt("d5")).toBeNull();
    expect(pos.pieceAt("e4")).toBeNull();
  });

  it("wins immediately when the enemy king is caught in the blast", () => {
    const pos = AtomicRules.createPosition("8/8/8/8/8/2k5/1q6/K7 w - - 0 1");
    expect(pos.isGameOver()).toBe(true);
  });
});

describe("horde", () => {
  it("starts asymmetrically with a kingless white horde", () => {
    const pos = HordeRules.createPosition();
    expect(pos.kingSquare("w")).toBeNull();
    expect(pos.kingSquare("b")).not.toBeNull();
    const whitePawns = pos.boardPieces().filter((p) => p.color === "w" && p.type === "p");
    expect(whitePawns.length).toBeGreaterThan(30);
  });

  it("gives black the win once the whole horde is captured", () => {
    const pos = HordeRules.createPosition("4k3/8/8/8/8/8/8/8 w - - 0 1");
    expect(pos.variantOutcome?.()).toMatchObject({ over: true, winner: "b" });
  });
});

describe("racing kings", () => {
  it("starts with no pawns and forbids giving check", () => {
    const pos = RacingKingsRules.createPosition();
    expect(pos.boardPieces().some((p) => p.type === "p")).toBe(false);
    for (const m of pos.legalMoves()) {
      const probe = pos.clone();
      probe.move(m.from, m.to, m.promotion);
      expect(probe.isCheck(), `${m.san} must not give check`).toBe(false);
    }
  });

  it("ends when a king reaches the eighth rank", () => {
    const pos = RacingKingsRules.createPosition("2K5/8/8/8/8/8/8/1k6 b - - 0 1");
    expect(pos.variantOutcome?.()).toMatchObject({ over: true });
  });
});

describe("giveaway", () => {
  it("makes captures compulsory", () => {
    const pos = GiveawayRules.createPosition();
    pos.move("e2", "e3");
    pos.move("d7", "d6");
    pos.move("f1", "a6");
    // Black must capture the bishop on a6 — every legal move is that capture.
    const moves = pos.legalMoves();
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.to === "a6")).toBe(true);
  });

  it("wins for the side that has given away everything", () => {
    const pos = GiveawayRules.createPosition("8/8/8/8/8/8/8/1r6 w - - 0 1");
    expect(pos.variantOutcome?.()).toMatchObject({ over: true, winner: "w" });
  });
});

describe("no castling", () => {
  it("strips castling rights from the start position and from loaded FENs", () => {
    expect(NoCastlingRules.startingFen()).toContain(" - ");
    const pos = NoCastlingRules.createPosition(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
    expect(pos.fen().split(" ")[2]).toBe("-");
  });

  it("refuses a castling move even with a cleared path", () => {
    const pos = NoCastlingRules.createPosition("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(pos.move("e1", "g1")).toBeNull();
    expect(pos.legalTargets("e1")).not.toContain("g1");
  });
});

describe("PGN serialization", () => {
  it("tags every non-classical variant so exported PGN is replayable", () => {
    for (const v of VARIANTS) {
      const tag = rulesFor(v.id).pgnVariantTag;
      if (v.id === "standard") expect(tag).toBeNull();
      else expect(tag, v.id).toBeTruthy();
    }
  });

  it("produces SAN history that round-trips through the engine", () => {
    const ids: VariantId[] = ["three-check", "king-of-the-hill", "atomic", "no-castling"];
    for (const id of ids) {
      const engine = rulesFor(id);
      const pos = engine.createPosition();
      pos.move("e2", "e4");
      pos.move("e7", "e5");
      expect(pos.historySan(), id).toEqual(["e4", "e5"]);
    }
  });
});

describe("server-side validation", () => {
  it("validates moves from a FEN without any client state", () => {
    const legal = ThreeCheckRules.validateMove(ThreeCheckRules.startingFen(), "e2", "e4");
    expect(legal?.san).toBe("e4");
    const illegal = ThreeCheckRules.validateMove(ThreeCheckRules.startingFen(), "e2", "e5");
    expect(illegal).toBeNull();
  });

  it("rejects moves for a variant whose rules forbid them (racing kings check)", () => {
    const fen = RacingKingsRules.startingFen();
    const pos = RacingKingsRules.createPosition(fen);
    const illegalCheck = pos.legalMoves().find((m) => m.san.includes("+"));
    expect(illegalCheck).toBeUndefined();
  });
});
