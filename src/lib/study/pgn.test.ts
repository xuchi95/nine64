import { describe, expect, it } from "vitest";
import { chapterToPgn, parseChapter, parseCommentCommands, parseStudyPgn, splitGames } from "./pgn";
import { mainLine } from "./types";

const SAMPLE = `[Event "Ván mẫu"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 {kiểm soát trung tâm [%cal Ge2e4] [%csl Rd5]} 2. Nf3 (2. Bc4 Nf6) 2... Nc6 3. Bb5 1-0`;

describe("study PGN", () => {
  it("keeps headers, comments and variations on import", () => {
    const chapter = parseChapter(SAMPLE);
    expect(chapter.headers["White"]).toBe("Alice");
    expect(chapter.result).toBe("1-0");

    const line = mainLine(chapter);
    expect(line.map((n) => n.san)).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5"]);

    const e5 = line[1]!;
    expect(e5.comment).toContain("trung tâm");
    expect(e5.arrows).toEqual([{ from: "e2", to: "e4", color: "green" }]);
    expect(e5.highlights).toEqual([{ square: "d5", color: "red" }]);

    // 2. Bc4 is an alternative to 2. Nf3 -> sibling of it.
    const nf3Siblings = e5.children;
    expect(nf3Siblings.map((n) => n.san)).toEqual(["Nf3", "Bc4"]);
    expect(nf3Siblings[1]!.children[0]!.san).toBe("Nf6");
  });

  it("round-trips through the exporter", () => {
    const chapter = parseChapter(SAMPLE);
    const pgn = chapterToPgn(chapter);
    expect(pgn).toContain('[White "Alice"]');
    expect(pgn).toContain("(2. Bc4 Nf6)");
    expect(pgn).toContain("[%cal Ge2e4]");

    const again = parseChapter(pgn);
    expect(mainLine(again).map((n) => n.san)).toEqual(mainLine(chapter).map((n) => n.san));
    expect(again.children[0]!.children[0]!.comment).toContain("trung tâm");
  });

  it("supports FEN start positions and multi-game files", () => {
    const fenGame = `[FEN "8/8/8/8/8/5k2/6q1/7K b - - 0 60"]\n\n60... Qg1+  0-1`;
    const chapters = parseStudyPgn(`${SAMPLE}\n\n${fenGame}`);
    expect(chapters).toHaveLength(2);
    expect(chapters[1]!.startFen).toContain("8/8/8/8");
    expect(mainLine(chapters[1]!).map((n) => n.san)).toEqual(["Qg1+"]);
    expect(chapterToPgn(chapters[1]!)).toContain('[SetUp "1"]');
  });

  it("splits games and drops illegal moves without throwing", () => {
    expect(splitGames(`${SAMPLE}\n\n${SAMPLE}`)).toHaveLength(2);
    const broken = parseChapter(`[Event "x"]\n\n1. e4 e5 2. Qz9 Nf6`);
    expect(mainLine(broken).map((n) => n.san)).toEqual(["e4", "e5"]);
  });

  it("extracts arrow/highlight commands from a comment", () => {
    const parsed = parseCommentCommands("ý tưởng [%cal Ge2e4,Rd1h5] [%csl Yf7]");
    expect(parsed.text).toBe("ý tưởng");
    expect(parsed.arrows).toHaveLength(2);
    expect(parsed.highlights[0]).toEqual({ square: "f7", color: "brass" });
  });
});
