import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { APP } from "@/config/app";
import { BOARD_THEMES, PIECE_SETS, getBoardTheme, getPieceSet } from "@/lib/chess/themes";
import { Piece } from "@/components/chess/Piece";
import { resetSettings, updateSettings, useSettings, type Settings } from "@/lib/settings";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: `Settings — ${APP.name}` },
      {
        name: "description",
        content:
          "Tune board themes, piece sets, sound, animations and engine performance for Nexus Chess.",
      },
      { property: "og:title", content: `Settings — ${APP.name}` },
      { property: "og:description", content: "Board, pieces, sound and engine preferences." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const settings = useSettings();

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <Button variant="outline" onClick={resetSettings}>
          Reset to defaults
        </Button>
      </div>

      <section className="panel mt-5 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Board
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {BOARD_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => updateSettings({ boardTheme: t.id })}
              className={cn(
                "rounded-md border p-2 transition-colors",
                settings.boardTheme === t.id ? "border-primary" : "border-border hover:border-primary/40",
              )}
            >
              <span className="grid grid-cols-4 overflow-hidden rounded">
                {Array.from({ length: 16 }).map((_, i) => {
                  const dark = (Math.floor(i / 4) + i) % 2 === 0;
                  return (
                    <span
                      key={i}
                      className="aspect-square"
                      style={{ backgroundColor: dark ? t.dark : t.light }}
                    />
                  );
                })}
              </span>
              <span className="mt-1.5 block text-xs">{t.name}</span>
            </button>
          ))}
        </div>

        <h2 className="mt-7 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Pieces
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PIECE_SETS.map((set) => (
            <button
              key={set.id}
              type="button"
              onClick={() => updateSettings({ pieceSet: set.id })}
              className={cn(
                "flex flex-col items-center rounded-md border p-2 transition-colors",
                settings.pieceSet === set.id ? "border-primary" : "border-border hover:border-primary/40",
              )}
              style={{ backgroundColor: getBoardTheme(settings.boardTheme).light }}
            >
              <span className="flex">
                <Piece type="k" color="w" set={set} size={40} />
                <Piece type="n" color="b" set={set} size={40} />
              </span>
              <span className="mt-1 text-xs text-black/70">{set.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel mt-4 divide-y divide-border p-5">
        <h2 className="pb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Gameplay
        </h2>
        <Toggle
          label="Show legal moves"
          description="Highlight destination squares for the selected piece."
          field="showLegalMoves"
        />
        <Toggle label="Board coordinates" description="Files and ranks on the board edge." field="showCoordinates" />
        <Toggle label="Auto-queen" description="Skip the promotion picker and always promote to a queen." field="autoQueen" />
        <Toggle label="Premove" description="Queue a move while the opponent is thinking." field="premove" />
        <Toggle label="Confirm resignation" description="Ask before resigning a game." field="confirmResign" />
        <Toggle label="Move animations" description="Animate pieces sliding between squares." field="animations" />
        <Toggle
          label="Colour-blind friendly"
          description="Adds shape cues so status is never colour-only."
          field="colorBlindMode"
        />
      </section>

      <section className="panel mt-4 space-y-5 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sound</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Sound effects</p>
            <p className="text-xs text-muted-foreground">Moves, captures, checks and results.</p>
          </div>
          <Switch
            checked={settings.soundEnabled}
            onCheckedChange={(v) => {
              updateSettings({ soundEnabled: v });
              if (v) playSound("notification");
            }}
          />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>Effects volume</span>
            <span className="tabular text-muted-foreground">
              {Math.round(settings.sfxVolume * 100)}%
            </span>
          </div>
          <Slider
            min={0}
            max={100}
            step={5}
            value={[Math.round(settings.sfxVolume * 100)]}
            onValueChange={([v]) => updateSettings({ sfxVolume: v / 100 })}
            onValueCommit={() => playSound("move")}
          />
        </div>
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Engine performance
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Threads and hash are auto-detected from your device; this sets the budget.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["performance", "balanced", "maximum"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => updateSettings({ enginePerformance: mode })}
              className={cn(
                "rounded-md border px-4 py-2 text-sm capitalize transition-colors",
                settings.enginePerformance === mode
                  ? "border-primary/60 bg-primary/15"
                  : "border-border bg-surface-2 hover:border-primary/40",
              )}
            >
              {mode === "maximum" ? "Maximum strength" : mode}
            </button>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function Toggle({
  label,
  description,
  field,
}: {
  label: string;
  description: string;
  field: keyof Pick<
    Settings,
    | "showLegalMoves"
    | "showCoordinates"
    | "autoQueen"
    | "premove"
    | "confirmResign"
    | "animations"
    | "colorBlindMode"
  >;
}) {
  const settings = useSettings();
  return (
    <div className="flex items-center justify-between py-3">
      <div className="pr-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={settings[field]}
        onCheckedChange={(v) => updateSettings({ [field]: v } as Partial<Settings>)}
      />
    </div>
  );
}
