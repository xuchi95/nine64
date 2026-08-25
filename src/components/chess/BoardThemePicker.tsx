import { Check } from "lucide-react";
import { Piece } from "@/components/chess/Piece";
import {
  BOARD_THEMES,
  PIECE_SETS,
  getBoardTheme,
  getPieceSet,
  type BoardTheme,
  type PieceSet,
} from "@/lib/chess/themes";
import { updateSettings, useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const PREVIEW_PIECES = [
  { sq: 0, type: "r", color: "b" },
  { sq: 3, type: "q", color: "b" },
  { sq: 9, type: "n", color: "w" },
  { sq: 14, type: "p", color: "w" },
] as const;

function MiniBoard({ theme, set }: { theme: BoardTheme; set: PieceSet }) {
  return (
    <div
      className="grid grid-cols-4 overflow-hidden rounded-md ring-1 ring-inset"
      style={{ ["--tw-ring-color" as string]: theme.frame }}
    >
      {Array.from({ length: 16 }, (_, i) => {
        const row = Math.floor(i / 4);
        const col = i % 4;
        const isLight = (row + col) % 2 === 0;
        const piece = PREVIEW_PIECES.find((p) => p.sq === i);
        return (
          <div
            key={i}
            className="relative aspect-square"
            style={{ background: isLight ? theme.light : theme.dark }}
          >
            {piece ? (
              <Piece type={piece.type} color={piece.color} set={set} size={26} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Board + piece theme switcher with live mini-board previews. */
export function BoardThemePicker({ className }: { className?: string }) {
  const settings = useSettings();
  const activeTheme = getBoardTheme(settings.boardTheme);
  const activeSet = getPieceSet(settings.pieceSet);

  return (
    <section className={cn("panel p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Board theme</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Pick a board and piece style — applies everywhere instantly.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {activeTheme.name} · {activeSet.name}
        </p>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Boards
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {BOARD_THEMES.map((theme) => {
          const active = theme.id === activeTheme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => updateSettings({ boardTheme: theme.id })}
              aria-pressed={active}
              className={cn(
                "group rounded-lg border p-2 text-left transition-colors",
                active
                  ? "border-primary/70 bg-primary/10"
                  : "border-border bg-surface-2 hover:border-primary/40",
              )}
            >
              <MiniBoard theme={theme} set={activeSet} />
              <span className="mt-2 flex items-center justify-between gap-1 text-sm font-medium">
                {theme.name}
                {active && <Check className="size-4 text-primary" />}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Pieces
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {PIECE_SETS.map((set) => {
          const active = set.id === activeSet.id;
          return (
            <button
              key={set.id}
              type="button"
              onClick={() => updateSettings({ pieceSet: set.id })}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                active
                  ? "border-primary/70 bg-primary/10"
                  : "border-border bg-surface-2 hover:border-primary/40",
              )}
            >
              <span
                className="flex size-8 items-center justify-center rounded"
                style={{ background: activeTheme.dark }}
              >
                <Piece type="n" color="w" set={set} size={26} />
              </span>
              <span
                className="flex size-8 items-center justify-center rounded"
                style={{ background: activeTheme.light }}
              >
                <Piece type="q" color="b" set={set} size={26} />
              </span>
              {set.name}
              {active && <Check className="size-4 text-primary" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
