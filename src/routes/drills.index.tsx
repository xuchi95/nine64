import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CheckCircle2, Circle, Dumbbell, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { SEVERITY_META } from "@/lib/coach/types";
import { useGameHistory } from "@/lib/history";
import {
  buildDrills,
  clearDrillProgress,
  setDrillDone,
  useDrillProgress,
  type Drill,
} from "@/lib/learn/drills";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/drills/")({
  head: () =>
    pageHead({
      path: "/drills",
      title: `Bài tập theo lỗi của bạn — ${APP.name}`,
      description:
        "Bài tập sinh từ những sai lầm trầm trọng nhất trong các ván của bạn, có thể đánh dấu đã luyện xong.",
    }),
  pendingComponent: ListSkeleton,
  errorComponent: DrillsError,
  component: DrillsPage,
});

function DrillsError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useT();
  return (
    <AppShell>
      <div className="panel mt-4 p-6 text-center">
        <h1 className="font-display text-xl font-bold">{t("study.drills.errorTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("study.drills.errorBody")}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={() => reset()}>{t("study.drills.retry")}</Button>
          <Button variant="outline" asChild>
            <Link to="/games">{t("study.drills.myGames")}</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

type Filter = "todo" | "done" | "all";

function DrillsPage() {
  const { t } = useT();
  const games = useGameHistory();
  const done = useDrillProgress();
  const [filter, setFilter] = useState<Filter>("todo");

  const drills = useMemo(() => {
    try {
      return buildDrills(games);
    } catch {
      return [];
    }
  }, [games]);
  const completed = drills.filter((d) => done[d.id]).length;
  const shown = drills.filter((d) =>
    filter === "all" ? true : filter === "done" ? !!done[d.id] : !done[d.id],
  );
  const percent = drills.length === 0 ? 0 : Math.round((completed / drills.length) * 100);

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("study.drills.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("study.drills.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["todo", "done", "all"] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f === "todo" ? t("study.drills.filterTodo") : f === "done" ? t("study.drills.filterDone") : t("study.drills.filterAll")}
            </Button>
          ))}
        </div>
      </div>

      <div className="panel mt-4 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">
            {t("study.drills.progressLabel")}{" "}
            <span className="tabular text-muted-foreground">
              {completed}/{drills.length}
            </span>
          </span>
          <span className="tabular font-display text-lg font-bold">{percent}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        {completed > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => clearDrillProgress()}
          >
            <RotateCcw className="size-4" /> {t("study.drills.resetProgress")}
          </Button>
        )}
      </div>

      {drills.length === 0 ? (
        <div className="panel mt-4 p-6 text-center">
          <Dumbbell className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            {(() => {
              const [before, after] = t("study.drills.emptyBody", { link: "\u0000" }).split("\u0000");
              return (
                <>
                  {before}
                  <Link to="/games" className="text-primary underline">
                    {t("study.drills.myGamesLink")}
                  </Link>
                  {after}
                </>
              );
            })()}
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map((drill) => (
            <DrillRow key={drill.id} drill={drill} doneAt={done[drill.id] ?? null} />
          ))}
          {shown.length === 0 && (
            <li className="panel p-6 text-center text-sm text-muted-foreground">
              {filter === "todo"
                ? t("study.drills.allDoneTodo")
                : t("study.drills.noneInSection")}
            </li>
          )}
        </ul>
      )}
    </AppShell>
  );
}

function DrillRow({ drill, doneAt }: { drill: Drill; doneAt: string | null }) {
  const { t } = useT();
  const meta = SEVERITY_META[drill.severity] ?? SEVERITY_META.moderate;
  return (
    <li className={`panel border p-4 ${doneAt ? "opacity-60" : ""} ${meta.ring}`}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label={doneAt ? t("study.drills.markUndone") : t("study.drills.markDone")}
          aria-pressed={!!doneAt}
          onClick={() => setDrillDone(drill.id, !doneAt)}
          className="mt-0.5 shrink-0 text-primary transition-transform hover:scale-110"
        >
          {doneAt ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-semibold uppercase tracking-wider ${meta.tone}`}>
              {meta.title}
            </span>
            {drill.loss !== null && (
              <span className="tabular text-xs text-muted-foreground">-{drill.loss}%</span>
            )}
            {drill.themes.map((t) => (
              <span key={t} className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
                {t}
              </span>
            ))}
          </div>

          <h2 className={`mt-1 text-sm font-semibold ${doneAt ? "line-through" : ""}`}>
            {drill.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{drill.problem}</p>
          <p className="mt-2 text-sm">
            <span className="font-semibold">{t("study.drills.needsPractice")}</span>
            {drill.task}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="truncate">{drill.gameLabel}</span>
            <Link
              to="/games/$gameId"
              params={{ gameId: drill.gameId }}
              className="text-primary underline"
            >
              {drill.ply !== null
                ? t("study.drills.openGameAt", { move: drill.moveLabel, san: drill.san ?? "" })
                : t("study.drills.openGame")}
            </Link>
            {doneAt && (
              <span>{t("study.drills.practicedOn", { date: new Date(doneAt).toLocaleDateString("vi-VN") })}</span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
