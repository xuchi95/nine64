import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { APP } from "@/config/app";
import { BOARD_THEMES, PIECE_SETS } from "@/lib/chess/themes";
import { Piece } from "@/components/chess/Piece";
import { resetSettings, updateSettings, useSettings, type Settings } from "@/lib/settings";
import { playSound, playShatter } from "@/lib/sound";
import { useBoardStyle } from "@/components/chess/useBoardStyle";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { FairplayStatusCard } from "@/components/game/FairplayStatusCard";
import { FormSkeleton } from "@/components/layout/PageSkeleton";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: `Cài đặt — ${APP.name}` },
      {
        name: "description",
        content:
          "Tuỳ chỉnh chủ đề bàn cờ, bộ quân, âm thanh, hiệu ứng và hiệu năng engine cho Nine64.",
      },
      { property: "og:title", content: `Cài đặt — ${APP.name}` },
      { property: "og:description", content: "Bàn cờ, quân cờ, âm thanh và tuỳ chọn engine." },
    ],
  }),
  pendingComponent: FormSkeleton,
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useT();
  const settings = useSettings();
  const boardStyle = useBoardStyle();
  const { user } = useAuth();

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("play.settings.title")}</h1>
        <Button variant="outline" onClick={resetSettings}>
          {t("play.settings.resetDefaults")}
        </Button>
      </div>

      {user && (
        <div className="mt-5">
          <FairplayStatusCard />
        </div>
      )}


      <section className="panel mt-5 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("play.settings.board")}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {BOARD_THEMES.map((th) => (
            <button
              key={th.id}
              type="button"
              onClick={() => boardStyle.selectBoardTheme(th.id)}
              className={cn(
                "rounded-md border p-2 transition-colors",
                boardStyle.theme.id === th.id ? "border-primary" : "border-border hover:border-primary/40",
              )}
            >
              <span className="grid grid-cols-4 overflow-hidden rounded">
                {Array.from({ length: 16 }).map((_, i) => {
                  const dark = (Math.floor(i / 4) + i) % 2 === 0;
                  return (
                    <span
                      key={i}
                      className="aspect-square"
                      style={{ backgroundColor: dark ? th.dark : th.light }}
                    />
                  );
                })}
              </span>
              <span className="mt-1.5 block text-xs">{th.name}</span>
            </button>
          ))}
        </div>

        <h2 className="mt-7 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("play.settings.pieces")}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PIECE_SETS.map((set) => (
            <button
              key={set.id}
              type="button"
              onClick={() => boardStyle.selectPieceSet(set.id)}
              className={cn(
                "flex flex-col items-center rounded-md border p-2 transition-colors",
                boardStyle.pieceSet.id === set.id ? "border-primary" : "border-border hover:border-primary/40",
              )}
              style={{ backgroundColor: boardStyle.theme.light }}
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
          {t("play.settings.gameplay")}
        </h2>
        <Toggle
          label={t("play.settings.showLegalMoves")}
          description={t("play.settings.showLegalMovesDesc")}
          field="showLegalMoves"
        />
        <Toggle
          label={t("play.settings.boardCoordinates")}
          description={t("play.settings.boardCoordinatesDesc")}
          field="showCoordinates"
        />
        <Toggle
          label={t("play.settings.autoQueen")}
          description={t("play.settings.autoQueenDesc")}
          field="autoQueen"
        />
        <Toggle
          label={t("play.settings.premove")}
          description={t("play.settings.premoveDesc")}
          field="premove"
        />
        <Toggle
          label={t("play.settings.confirmResign")}
          description={t("play.settings.confirmResignDesc")}
          field="confirmResign"
        />
        <Toggle
          label={t("play.settings.moveAnimations")}
          description={t("play.settings.moveAnimationsDesc")}
          field="animations"
        />
        <Toggle
          label={t("play.settings.colorBlind")}
          description={t("play.settings.colorBlindDesc")}
          field="colorBlindMode"
        />
      </section>

      <section className="panel mt-4 space-y-5 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("play.settings.sound")}
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t("play.settings.soundEffects")}</p>
            <p className="text-xs text-muted-foreground">{t("play.settings.soundEffectsDesc")}</p>
          </div>
          <Switch
            checked={settings.soundEnabled}
            onCheckedChange={(v) => {
              updateSettings({ soundEnabled: v });
              if (v) playSound("notification");
            }}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="pr-4">
            <p className="text-sm font-medium">{t("play.settings.shatterSound")}</p>
            <p className="text-xs text-muted-foreground">
              {t("play.settings.shatterSoundDesc")}
            </p>
          </div>
          <Switch
            checked={settings.shatterSound}
            disabled={!settings.soundEnabled}
            onCheckedChange={(v) => {
              updateSettings({ shatterSound: v });
              if (v) playShatter();
            }}
          />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>{t("play.settings.effectsVolume")}</span>
            <span className="tabular text-muted-foreground">
              {Math.round(settings.sfxVolume * 100)}%
            </span>
          </div>
          <Slider
            min={0}
            max={100}
            step={5}
            value={[Math.round(settings.sfxVolume * 100)]}
            onValueChange={([v]) => updateSettings({ sfxVolume: (v ?? 60) / 100 })}
            onValueCommit={() => playSound("move")}
          />
        </div>
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("play.settings.enginePerformance")}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("play.settings.enginePerformanceDesc")}
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
              {t(`play.settings.${mode}`)}
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
