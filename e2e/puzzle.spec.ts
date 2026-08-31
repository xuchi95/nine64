import { expect, test } from "@playwright/test";
import { goto } from "./helpers";

test.describe("puzzles", () => {
  test("puzzle page loads without runtime errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await goto(page, "/puzzles");
    await expect(page.locator("body")).toContainText(/câu đố|puzzle|chiến thuật|tactic/i);
    expect(errors.filter((m) => !/ResizeObserver/i.test(m))).toEqual([]);
  });

  test("solver requires the full principal line, not just the first move", async ({ page }) => {
    await goto(page, "/puzzles");

    const result = await page.evaluate(async () => {
      const solver = await import("/src/lib/learn/puzzleSolver.ts");

      // Ladder mate in two: 1.Rb7 Kg8 2.Ra8#
      const puzzle = {
        id: "e2e-mate-in-2",
        fen: "7k/8/8/8/8/8/8/RR5K w - - 0 1",
        solution: [
          { uci: "b1b7", san: "Rb7" },
          { uci: "h8g8", san: "Kg8" },
          { uci: "a1a8", san: "Ra8#" },
        ],
        alternates: {} as Record<number, string[]>,
        solutionSan: "Rb7",
        color: "w" as const,
        themes: [],
        rating: 1500,
        gameId: "e2e",
        ply: 0,
      };

      let state = solver.initialSolverState(puzzle as never);
      const plies = solver.solverPlyCount(puzzle as never);

      const wrong = solver.attemptMove(puzzle as never, state, "a1", "a2");
      const first = solver.attemptMove(puzzle as never, state, "b1", "b7");
      state = { fen: first.fen, playedPlies: first.playedPlies, status: first.status, lastMove: first.lastMove };
      const second = solver.attemptMove(puzzle as never, state, "a1", "a8");

      return {
        plies,
        wrongStatus: wrong.status,
        firstStatus: first.status,
        firstReply: first.replySan,
        finalStatus: second.status,
      };
    });

    expect(result.plies).toBeGreaterThan(1);
    expect(result.wrongStatus).toBe("wrong");
    // First correct move must not finish the puzzle; the forced reply is auto-played.
    expect(result.firstStatus).toBe("progress");
    expect(result.firstReply).toBeTruthy();
    expect(result.finalStatus).toBe("solved");
  });
});
