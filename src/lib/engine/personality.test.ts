import { describe, expect, it } from "vitest";
import { getBotLevel, getPersonality } from "@/config/bots";
import {
  makeRng,
  multiPvFor,
  personalityActive,
  pickPersonalityMove,
  toleranceFor,
  extractFeatures,
  styleScore,
} from "./personality";
import { parseUciOptionName, type EngineLine } from "./stockfish";

const line = (move: string, cp: number, pv: string[] = [move]): EngineLine => ({
  move,
  cp,
  mateIn: null,
  depth: 20,
  pv,
});

// Italian-ish middlegame with several near-equal candidates.
const FEN = "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 6";

const CANDIDATES: EngineLine[] = [
  line("e1g1", 30), // castles: safe/solid
  line("c4f7", 20), // Bxf7+ sacrifice, check, king hunt
  line("c1g5", 18), // pin, activity
  line("h2h3", 14), // quiet
];

describe("personality reranker", () => {
  it("Oracle always plays the engine best move", () => {
    for (const lv of [1, 8, 15]) {
      expect(
        pickPersonalityMove({
          lines: CANDIDATES,
          personality: getPersonality("oracle"),
          level: getBotLevel(lv),
          fen: FEN,
        }),
      ).toBe("e1g1");
    }
  });

  it("Viper and Fortress can diverge on near-equal candidates", () => {
    const viper = pickPersonalityMove({
      lines: CANDIDATES,
      personality: getPersonality("viper"),
      level: getBotLevel(6),
      fen: FEN,
    });
    const fortress = pickPersonalityMove({
      lines: CANDIDATES,
      personality: getPersonality("fortress"),
      level: getBotLevel(6),
      fen: FEN,
    });
    expect(viper).not.toBe(fortress);
    expect(CANDIDATES.map((l) => l.move)).toContain(viper);
    expect(CANDIDATES.map((l) => l.move)).toContain(fortress);
  });

  it("Viper prefers the forcing check when it is inside tolerance", () => {
    expect(
      pickPersonalityMove({
        lines: CANDIDATES,
        personality: getPersonality("viper"),
        level: getBotLevel(6),
        fen: FEN,
      }),
    ).toBe("c4f7");
  });

  it("never returns a candidate outside the level eval budget", () => {
    const lines = [line("e1g1", 30), line("h2h3", -400)];
    for (const id of ["viper", "gambit", "chaos", "nova", "fortress", "atlas"]) {
      for (const lv of [1, 8, 15]) {
        const picked = pickPersonalityMove({
          lines,
          personality: getPersonality(id),
          level: getBotLevel(lv),
          fen: FEN,
          rng: makeRng(7),
        });
        expect(picked).toBe("e1g1");
      }
    }
  });

  it("level 15 tolerance stays tiny and never blunders", () => {
    for (const id of ["viper", "gambit", "chaos"]) {
      const tol = toleranceFor(getPersonality(id), getBotLevel(15));
      expect(tol).toBeLessThanOrEqual(15);
      const picked = pickPersonalityMove({
        lines: [line("e1g1", 30), line("c4f7", 5)],
        personality: getPersonality(id),
        level: getBotLevel(15),
        fen: FEN,
        rng: makeRng(3),
      });
      expect(picked).toBe("e1g1");
    }
  });

  it("still expresses personality at levels 13-15 when moves are equal", () => {
    const tight = [line("e1g1", 30), line("c4f7", 26)];
    expect(
      pickPersonalityMove({
        lines: tight,
        personality: getPersonality("viper"),
        level: getBotLevel(14),
        fen: FEN,
      }),
    ).toBe("c4f7");
  });

  it("never gives up a forced mate for style", () => {
    const lines: EngineLine[] = [
      { move: "c4f7", cp: null, mateIn: 2, depth: 20, pv: ["c4f7"] },
      line("e1g1", 30),
    ];
    expect(
      pickPersonalityMove({
        lines,
        personality: getPersonality("fortress"),
        level: getBotLevel(5),
        fen: FEN,
      }),
    ).toBe("c4f7");
  });

  it("Chaos is deterministic per seed and bounded by tolerance", () => {
    const a = pickPersonalityMove({
      lines: CANDIDATES,
      personality: getPersonality("chaos"),
      level: getBotLevel(4),
      fen: FEN,
      rng: makeRng(42),
    });
    const b = pickPersonalityMove({
      lines: CANDIDATES,
      personality: getPersonality("chaos"),
      level: getBotLevel(4),
      fen: FEN,
      rng: makeRng(42),
    });
    expect(a).toBe(b);
    expect(CANDIDATES.map((l) => l.move)).toContain(a);
  });

  it("opening book only nudges legal in-budget moves in the opening phase", () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const lines = [line("d2d4", 25), line("e2e4", 22)];
    // Viper's book is e4/f4 — it should take e4 while inside tolerance.
    expect(
      pickPersonalityMove({
        lines,
        personality: getPersonality("viper"),
        level: getBotLevel(4),
        fen: start,
        ply: 0,
      }),
    ).toBe("e2e4");
    // Chess960 must not inherit standard-opening assumptions, and the book is
    // opening-phase only.
    const viper = getPersonality("viper");
    const f = extractFeatures(start, "e2e4");
    const std = styleScore("viper", f, viper, { ply: 0, variant: "standard" });
    const p960 = styleScore("viper", f, viper, { ply: 0, variant: "chess960" });
    const late = styleScore("viper", f, viper, { ply: 30, variant: "standard" });
    expect(std).toBeGreaterThan(p960);
    expect(late).toBe(p960);
  });
});

describe("titan level 16", () => {
  const titan = getBotLevel(16);

  it("disables personality entirely", () => {
    for (const id of ["viper", "gambit", "chaos", "atlas"]) {
      expect(personalityActive(titan, getPersonality(id))).toBe(false);
      expect(toleranceFor(getPersonality(id), titan)).toBe(0);
      expect(multiPvFor(getPersonality(id), titan)).toBe(1);
      expect(
        pickPersonalityMove({
          lines: CANDIDATES,
          personality: getPersonality(id),
          level: titan,
          fen: FEN,
        }),
      ).toBe("e1g1");
    }
  });

  it("keeps personality alive for levels 1-15", () => {
    for (let lv = 1; lv <= 15; lv++) {
      expect(personalityActive(getBotLevel(lv), getPersonality("viper"))).toBe(true);
      expect(multiPvFor(getPersonality("viper"), getBotLevel(lv))).toBeGreaterThan(1);
    }
  });
});

describe("uci option handshake", () => {
  it("parses advertised options and ignores other lines", () => {
    expect(parseUciOptionName("option name MultiPV type spin default 1 min 1 max 256")).toBe(
      "MultiPV",
    );
    expect(parseUciOptionName("option name Skill Level type spin default 20")).toBe("Skill Level");
    expect(parseUciOptionName("id name Stockfish 18")).toBeNull();
    expect(parseUciOptionName("uciok")).toBeNull();
  });

  it("Contempt is no longer part of the search request surface", () => {
    const src = "contempt";
    expect(JSON.stringify(getPersonality("viper"))).not.toContain(src);
  });
});
