import { describe, expect, it, afterEach, beforeAll } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ChessBoard, type BoardPiece } from "./ChessBoard";
import { StaticBoard, START_PIECES } from "./StaticBoard";
import { FILES, RANKS } from "./boardSurface";
import {
  BOARD_THEMES,
  PIECE_SETS,
  resolveBoardThemeId,
  resolvePieceSetId,
} from "@/lib/chess/themes";
import { updateSettings } from "@/lib/settings";

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(cleanup);

const SQUARES = RANKS.flatMap((rank) => FILES.map((file) => `${file}${rank}`));

/** Square background fingerprint: colour + gradient + inset ring. */
function surfaceOf(el: HTMLElement) {
  const s = el.style;
  return [s.backgroundColor, s.backgroundImage, s.boxShadow].join(" | ");
}

/** Normalised SVG markup (generated gradient ids stripped). */
function svgMarkup(root: Element | null | undefined) {
  const svg = root?.querySelector("svg");
  if (!svg) return null;
  return svg.innerHTML
    .replace(/id="[^"]*"/g, 'id=""')
    .replace(/url\(#[^)]*\)/g, "url(#)")
    .replace(/\s(width|height)="[^"]*"/g, "");
}

/** Light mode keeps the theme ids literal, so both boards resolve the same way. */
function renderReal(pieces: BoardPiece[], boardTheme: string, pieceSet: string) {
  updateSettings({ boardTheme, pieceSet, appearance: "light" });
  return render(
    <ChessBoard
      pieces={pieces}
      orientation="w"
      legalTargets={() => []}
      canMoveFrom={() => false}
      onMove={() => false}
      needsPromotion={() => false}
      interactive={false}
      turn="w"
    />,
  );
}

function renderHero(boardTheme: string, pieceSet: string) {
  // The hero board consumes the same resolver the real board uses internally.
  return render(
    <StaticBoard
      pieces={START_PIECES}
      boardTheme={resolveBoardThemeId(boardTheme, "light")}
      pieceSet={resolvePieceSetId(pieceSet, "light")}
    />,
  );
}

describe("hero board matches the real board", () => {
  const theme = BOARD_THEMES[0]!.id;
  const set = PIECE_SETS[0]!.id;

  it("paints all 64 squares identically", () => {
    const real = renderReal(START_PIECES, theme, set);
    const realSurfaces = new Map(
      SQUARES.map((sq) => {
        const cell = real.container.querySelector<HTMLElement>(`[aria-label="${sq}"]`);
        expect(cell, `real board missing ${sq}`).toBeTruthy();
        return [sq, surfaceOf(cell!)] as const;
      }),
    );
    cleanup();

    const hero = renderHero(theme, set);
    for (const sq of SQUARES) {
      const cell = hero.container.querySelector<HTMLElement>(`[data-cell="${sq}"]`);
      expect(cell, `hero board missing ${sq}`).toBeTruthy();
      expect(surfaceOf(cell!), `square ${sq}`).toBe(realSurfaces.get(sq));
    }
  });

  it("renders the same piece SVG on the same squares", () => {
    const real = renderReal(START_PIECES, theme, set);
    const realPieces = new Map(
      SQUARES.map(
        (sq) => [sq, svgMarkup(real.container.querySelector(`[data-square="${sq}"]`))] as const,
      ),
    );
    cleanup();

    const hero = renderHero(theme, set);
    for (const sq of SQUARES) {
      const heroSvg = svgMarkup(hero.container.querySelector(`[data-square="${sq}"]`));
      expect(heroSvg, `piece markup on ${sq}`).toBe(realPieces.get(sq));
    }
    expect(hero.container.querySelectorAll("svg").length).toBe(START_PIECES.length);
  });

  it("keeps parity across every board theme and piece set", () => {
    for (const t of BOARD_THEMES) {
      for (const s of PIECE_SETS) {
        const real = renderReal(START_PIECES, t.id, s.id);
        const realSurfaces = new Map(
          SQUARES.map(
            (sq) =>
              [sq, surfaceOf(real.container.querySelector<HTMLElement>(`[aria-label="${sq}"]`)!)] as const,
          ),
        );
        const realFrame = real.container
          .querySelector<HTMLElement>("[data-board-root]")!
          .style.backgroundColor;
        cleanup();

        const hero = renderHero(t.id, s.id);
        for (const sq of SQUARES) {
          const cell = hero.container.querySelector<HTMLElement>(`[data-cell="${sq}"]`)!;
          expect(surfaceOf(cell), `${t.id}/${s.id} ${sq}`).toBe(realSurfaces.get(sq));
        }
        expect(
          (hero.container.firstElementChild as HTMLElement).style.border,
          `${t.id} frame`,
        ).toContain(realFrame);
        cleanup();
      }
    }
  }, 60_000);

  it("scales fluidly so it cannot drift on any screen size", () => {
    const hero = renderHero(theme, set);
    const cells = hero.container.querySelectorAll<HTMLElement>("[data-cell]");
    expect(cells.length).toBe(64);
    cells.forEach((c) => {
      // No fixed pixel sizing: the grid derives square size from its container,
      // exactly like the responsive real board.
      expect(c.className).toContain("aspect-square");
      expect(c.style.width).toBe("");
      expect(c.style.height).toBe("");
    });
    expect(hero.container.querySelector(".grid")!.className).toContain("grid-cols-8");
    hero.container.querySelectorAll("svg").forEach((svg) => {
      expect(svg.getAttribute("viewBox")).toBeTruthy();
    });
  });
});
