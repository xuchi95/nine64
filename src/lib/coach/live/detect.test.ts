import { describe, expect, it } from "vitest";
import { CADENCE, classifyMove, passesCadence } from "./detect";
import { buildMoment } from "./present";
import { buildMoveFacts, detectOpeningIssue, findHangingPiece } from "./facts";
import type { MoveFacts } from "./types";

const base: MoveFacts = {
  moveNumber: 12,
  plyIndex: 22,
  playedSan: "Nf3",
  bestUci: "d2d4",
  bestSan: "d4",
  evalBeforeCp: 20,
  evalAfterCp: 10,
  mateBefore: null,
  mateAgainst: null,
  hangingSquare: null,
  hangingPiece: null,
  bestIsTactic: false,
  openingIssue: null,
  strategicIssue: null,
};

describe("classifyMove", () => {
  it("stays silent on a normal move", () => {
    expect(classifyMove(base, "teaching")).toBeNull();
  });

  it("flags a blunder as critical in every mode", () => {
    const facts = { ...base, evalAfterCp: -400 };
    for (const mode of ["quiet", "normal", "teaching"] as const) {
      expect(classifyMove(facts, mode)?.severity).toBe("critical");
    }
  });

  it("quiet mode ignores inaccuracies and opening principles", () => {
    const facts = { ...base, plyIndex: 8, openingIssue: "early_queen" as const };
    expect(classifyMove(facts, "quiet")).toBeNull();
    expect(classifyMove(facts, "teaching")?.kind).toBe("opening_principle");
  });

  it("normal mode explains missed tactics but not opening nudges", () => {
    const missed = { ...base, bestIsTactic: true, evalAfterCp: -160 };
    expect(classifyMove(missed, "normal")?.kind).toBe("missed_tactic");
    expect(classifyMove({ ...base, openingIssue: "king_uncastled" as const }, "normal")).toBeNull();
  });

  it("reports a hanging piece with the piece_safety skill", () => {
    const facts = { ...base, evalAfterCp: -200, hangingSquare: "e5", hangingPiece: "n" };
    const decision = classifyMove(facts, "normal");
    expect(decision?.kind).toBe("hanging_piece");
    expect(decision?.skillKey).toBe("piece_safety");
  });

  it("treats walking into mate as critical", () => {
    expect(classifyMove({ ...base, mateAgainst: 2 }, "quiet")?.severity).toBe("critical");
  });
});

describe("passesCadence", () => {
  const decision = { kind: "mistake" as const, severity: "major" as const, skillKey: "x", lossCp: 200 };

  it("throttles back-to-back non-critical interventions", () => {
    expect(passesCadence(decision, { lastPlyIndex: 20, shown: 1 }, 22)).toBe(false);
    expect(passesCadence(decision, { lastPlyIndex: 20, shown: 1 }, 26)).toBe(true);
  });

  it("never throttles a critical error", () => {
    const critical = { ...decision, severity: "critical" as const };
    expect(passesCadence(critical, { lastPlyIndex: 21, shown: 3 }, 22)).toBe(true);
  });

  it("caps the number of interventions per game", () => {
    expect(passesCadence(decision, { lastPlyIndex: null, shown: CADENCE.maxPerGame }, 40)).toBe(false);
  });
});

describe("facts from the rules engine", () => {
  it("detects an undefended knight the opponent can take", () => {
    // Black knight on e5 attacked by the d4 pawn, no black defender.
    const hanging = findHangingPiece("4k3/8/8/4n3/3P4/8/8/4K3 w - - 0 1", "standard", "b");
    expect(hanging).toEqual({ square: "e5", piece: "n" });
  });

  it("does not flag a defended piece", () => {
    const hanging = findHangingPiece("4k3/8/5p2/4n3/3P4/8/8/4K3 w - - 0 1", "standard", "b");
    expect(hanging).toBeNull();
  });

  it("spots an early queen sortie", () => {
    const issue = detectOpeningIssue({
      userColor: "w",
      plyIndex: 6,
      history: [
        { san: "e4", from: "e2", to: "e4", color: "w" },
        { san: "e5", from: "e7", to: "e5", color: "b" },
        { san: "Qh5", from: "d1", to: "h5", color: "w" },
        { san: "Nc6", from: "b8", to: "c6", color: "b" },
        { san: "Qf3", from: "h5", to: "f3", color: "w" },
      ],
    });
    expect(issue).toBe("early_queen");
  });
});

describe("buildMoveFacts + buildMoment", () => {
  it("derives SAN for the engine move and never invents one", () => {
    const facts = buildMoveFacts({
      variant: "standard",
      userColor: "w",
      beforeFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      afterFen: "rnbqkbnr/pppppppp/8/8/8/7P/PPPPPPP1/RNBQKBNR b KQkq - 0 1",
      playedSan: "h3",
      plyIndex: 0,
      moveNumber: 1,
      bestUci: "e2e4",
      evalBeforeCp: 30,
      evalAfterCp: -60,
      mateBefore: null,
      mateAgainst: null,
      history: [{ san: "h3", from: "h2", to: "h3", color: "w" }],
    });
    expect(facts.bestSan).toBe("e4");

    const decision = classifyMove(facts, "teaching");
    expect(decision).not.toBeNull();
    const moment = buildMoment(decision!, facts, {
      mode: "teaching",
      personality: "socratic_coach",
      locale: "vi",
    });
    expect(moment.arrow).toEqual({ from: "e2", to: "e4" });
    expect(moment.question).toBeTruthy();
    expect(moment.message.length).toBeGreaterThan(10);
  });

  it("keeps the message AI-free and deterministic", () => {
    const facts = { ...base, evalAfterCp: -500 };
    const decision = classifyMove(facts, "quiet")!;
    const a = buildMoment(decision, facts, { mode: "quiet", personality: "concise_master", locale: "en" });
    const b = buildMoment(decision, facts, { mode: "quiet", personality: "concise_master", locale: "en" });
    expect(a.message).toBe(b.message);
    expect(a.bestSan).toBe("d4");
  });
});
