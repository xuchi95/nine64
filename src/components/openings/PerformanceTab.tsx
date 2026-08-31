import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Compass, Target, AlertTriangle, Sparkles } from "lucide-react";
import { OpeningBoard, moveNumberLabel, pathLabel } from "@/components/openings/OpeningBoard";
import { GamePanel } from "@/components/game/GamePanel";
import { Button } from "@/components/ui/button";
import { useGameHistory } from "@/lib/history";
import { buildOpeningTree, childRows, nodeAtPath } from "@/lib/openings/tree";
import {
  focusSuggestions,
  summariseRepertoire,
  topLines,
  type Side,
  type TrainingFocus,
} from "@/lib/openings/explorer";
import {
  compareGame,
  detectNovelties,
  indexRepertoire,
  openingLeaks,
  summarisePerformance,
} from "@/lib/openings/performance";
import { sansOf, type RepertoireLine } from "@/lib/openings/repertoireTypes";
import { useT } from "@/lib/i18n";

const STAT_DEPTH = 6;

export function PerformanceTab({ repertoireLines }: { repertoireLines: RepertoireLine[] }) {
  const { t } = useT();
  const games = useGameHistory();
  const [side, setSide] = useState<Side>("w");
  const [sans, setSans] = useState<string[]>([]);
  const [orientation, setOrientation] = useState<Side>("w");

  const sideGames = useMemo(
    () => games.filter((g) => ((g.playerColor ?? "w") as Side) === side),
    [games, side],
  );
  const tree = useMemo(() => buildOpeningTree(sideGames), [sideGames]);
  const node = useMemo(() => nodeAtPath(tree, sans.join(" ")), [tree, sans]);
  const rows = useMemo(() => (node ? childRows(node) : []), [node]);
  const summary = useMemo(() => summariseRepertoire(games, side, STAT_DEPTH), [games, side]);
  const played = useMemo(() => topLines(games, side, STAT_DEPTH, 1).slice(0, 8), [games, side]);
  const focus = useMemo(() => focusSuggestions(games, STAT_DEPTH), [games]);

  const index = useMemo(() => indexRepertoire(repertoireLines), [repertoireLines]);
  const comparisons = useMemo(() => games.map((g) => compareGame(g, index)), [games, index]);
  const perf = useMemo(() => summarisePerformance(comparisons), [comparisons]);
  const leaks = useMemo(() => openingLeaks(games, index, comparisons).slice(0, 6), [games, index, comparisons]);
  const novelties = useMemo(() => detectNovelties(games, comparisons, 8), [games, comparisons]);

  if (games.length === 0) {
    return (
      <div className="panel p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("study.openings.emptyBody")}</p>
        <Button asChild className="mt-4">
          <Link to="/play">{t("study.openings.playNow")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["w", "b"] as Side[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={side === s ? "default" : "outline"}
            onClick={() => {
              setSide(s);
              setOrientation(s);
              setSans([]);
            }}
          >
            {s === "w" ? t("study.openings.asWhite") : t("study.openings.asBlack")}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground">
          {t("study.openings.summaryScore", {
            score: summary.score,
            games: summary.games,
            lines: summary.distinctLines,
          })}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("lab.perf.games")} value={String(perf.games)} />
        <Stat label={t("lab.perf.inBook")} value={`${Math.round(perf.bookAccuracy * 100)}%`} />
        <Stat label={t("lab.perf.scoreInBook")} value={`${Math.round(perf.scoreInBook * 100)}%`} />
        <Stat label={t("lab.perf.scoreOutBook")} value={`${Math.round(perf.scoreOutOfBook * 100)}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          <div className="mx-auto w-full max-w-[520px]">
            <OpeningBoard
              sans={sans}
              orientation={orientation}
              onPush={(san) => setSans((prev) => [...prev, san])}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!sans.length} onClick={() => setSans((p) => p.slice(0, -1))}>
                {t("study.openings.back")}
              </Button>
              <Button size="sm" variant="outline" disabled={!sans.length} onClick={() => setSans([])}>
                {t("study.openings.resetLine")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
                {t("study.openings.flip")}
              </Button>
            </div>
          </div>

          <GamePanel title={t("study.openings.topLines")} bodyClassName="p-3">
            <ul className="space-y-1">
              {played.map((line) => (
                <li key={line.path}>
                  <button
                    type="button"
                    onClick={() => setSans(line.sans)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition hover:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs">{pathLabel(line.sans)}</span>
                      {line.opening ? (
                        <span className="block truncate text-2xs text-muted-foreground">{line.opening}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-right font-mono text-2xs text-muted-foreground">
                      {line.games} {t("study.openings.games")} · {line.score}%
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </GamePanel>

          <GamePanel title={t("study.openings.yourMoves")} bodyClassName="p-3">
            {rows.length === 0 ? (
              <p className="px-1 py-3 text-xs text-muted-foreground">{t("study.openings.noMoves")}</p>
            ) : (
              <ul className="space-y-1">
                {rows.map((row) => (
                  <li key={row.path}>
                    <button
                      type="button"
                      onClick={() => setSans((prev) => [...prev, row.san])}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-surface-2"
                    >
                      <span className="font-mono text-xs">
                        {moveNumberLabel(row.ply)} {row.san}
                      </span>
                      <span className="font-mono text-2xs text-muted-foreground">
                        {row.games} · {row.winRate}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </GamePanel>
        </div>

        <div className="space-y-3">
          <GamePanel title={t("lab.perf.leaks")} bodyClassName="p-3">
            {leaks.length === 0 ? (
              <p className="px-1 py-3 text-xs text-muted-foreground">{t("lab.perf.leaksEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {leaks.map((leak) => (
                  <li key={leak.key} className="rounded-lg border border-border/60 bg-surface-2/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold">
                        {leak.openingName ?? pathLabel(sansOf(leak.path))}
                      </span>
                      <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-destructive">
                        <AlertTriangle className="mr-1 inline size-3" />
                        {leak.severity}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-2xs text-muted-foreground break-words">
                      {pathLabel(sansOf(leak.path))}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("lab.perf.leakLine", {
                        games: leak.games,
                        score: Math.round(leak.score * 100),
                        cp: Math.round(leak.cpLost / Math.max(leak.games, 1)),
                      })}
                    </p>
                    {leak.expectedSan && leak.playedSan ? (
                      <p className="mt-1 text-xs">
                        {t("lab.perf.deviation", { played: leak.playedSan, expected: leak.expectedSan })}
                      </p>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => setSans(sansOf(leak.path))}
                    >
                      <Compass className="size-4" /> {t("study.openings.focusOpen")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </GamePanel>

          <GamePanel title={t("lab.perf.novelties")} bodyClassName="p-3">
            <p className="px-1 pb-2 text-2xs text-muted-foreground">{t("lab.perf.noveltyNote")}</p>
            {novelties.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">{t("lab.perf.noveltiesEmpty")}</p>
            ) : (
              <ul className="space-y-1">
                {novelties.map((n) => (
                  <li key={`${n.gameId}-${n.ply}`} className="rounded-md px-2 py-1.5 hover:bg-surface-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs">
                        <Sparkles className="mr-1 inline size-3 text-primary" />
                        {moveNumberLabel(n.ply)} {n.san}
                      </span>
                      <Link to="/games/$gameId" params={{ gameId: n.gameId }} className="text-2xs text-primary">
                        {t("lab.perf.openGame")}
                      </Link>
                    </div>
                    <span className="block truncate font-mono text-2xs text-muted-foreground">
                      {pathLabel(sansOf(n.path))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </GamePanel>

          <GamePanel title={t("study.openings.focusPlan")} bodyClassName="p-3">
            {focus.length === 0 ? (
              <p className="px-1 py-3 text-xs text-muted-foreground">{t("study.openings.focusEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {focus.map((item) => (
                  <FocusCard
                    key={item.id}
                    item={item}
                    onOpen={() => {
                      setSide(item.side);
                      setOrientation(item.side);
                      setSans(item.sans);
                    }}
                  />
                ))}
              </ul>
            )}
          </GamePanel>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-3">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold">{value}</p>
    </div>
  );
}

function FocusCard({ item, onOpen }: { item: TrainingFocus; onOpen: () => void }) {
  const { t } = useT();
  return (
    <li className="rounded-lg border border-border/60 bg-surface-2/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{item.title}</h3>
        <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-primary">
          {t("study.openings.priority", { value: item.priority })}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
      <p className="mt-1 text-xs">{item.task}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onOpen}>
          <Compass className="size-4" /> {t("study.openings.focusOpen")}
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link to="/drills">
            <Target className="size-4" /> {t("study.openings.focusReview")}
          </Link>
        </Button>
      </div>
    </li>
  );
}
