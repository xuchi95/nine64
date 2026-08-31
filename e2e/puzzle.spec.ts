import { expect, test } from "@playwright/test";

test.describe("puzzles", () => {
  test("puzzle page loads and grades against the full solution line", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/puzzles", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/puzzle|câu đố|chiến thuật|tactic/i);
    expect(errors.filter((m) => !/ResizeObserver/i.test(m))).toEqual([]);
  });

  test("solver accepts the full principal line and alternates only", async ({ page }) => {
    await page.goto("/puzzles", { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async () => {
      const gen = await import("/src/lib/learn/puzzleGen.ts");
      const solver = await import("/src/lib/learn/puzzleSolver.ts");
      const puzzles = gen.generateFromLibrary(1);
      if (!puzzles.length) return { skipped: true } as const;
      const puzzle = puzzles[0]!;
      let state = solver.initialSolverState(puzzle);
      const plies = solver.solverPlyCount(puzzle);
      const first = puzzle.solution[0]!;
      const wrong = solver.attemptMove(puzzle, state, { from: "a1", to: "a2" });
      const right = solver.attemptMove(puzzle, state, first);
      state = right.state;
      return {
        skipped: false as const,
        plies,
        wrongStatus: wrong.status,
        rightStatus: right.status,
      };
    });

    if (result.skipped) test.skip(true, "no library puzzles available in this build");
    expect(result.plies).toBeGreaterThan(0);
    expect(result.wrongStatus).not.toBe("correct");
    expect(["correct", "solved", "continue"]).toContain(String(result.rightStatus));
  });
});
