import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, LineChart, Timer } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { useGameHistory } from "@/lib/history";
import { SEVERITY_META, type MistakeSeverity } from "@/lib/coach/types";
import {
  buildProgress,
  totals,
  trend,
  type Bucket,
  type Granularity,
} from "@/lib/insights/progress";
import { DashboardSkeleton } from "@/components/layout/PageSkeleton";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/progress")({
  head: () =>
    pageHead({
      path: "/progress",
      title: `Tiến bộ theo thời gian — ${APP.name}`,
      description:
        "Theo dõi tiến bộ qua từng tuần: lỗi nào giảm, % mất cơ hội mỗi nước và nhịp suy nghĩ cải thiện ra sao.",
    }),
  pendingComponent: DashboardSkeleton,
  component: ProgressPage,
});

const SEVERITIES: MistakeSeverity[] = ["basic", "moderate", "serious", "critical"];

function fmt(value: number | null, digits = 1, suffix = ""): string {
  if (value === null || !Number.isFinite(value)) return "–";
  return `${value.toFixed(digits)}${suffix}`;
}

/** Lower is better for loss/mistakes; higher is better for accuracy. */
function DeltaBadge({ change, lowerIsBetter, unit }: { change: number | null; lowerIsBetter: boolean; unit: string }) {
  const { t } = useT();
  if (change === null || Math.abs(change) < 0.05) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ArrowRight className="size-3" /> {t("study.progress.noChange")}
      </span>
    );
  }
  const improved = lowerIsBetter ? change < 0 : change > 0;
  const Icon = change < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        improved ? "text-success" : "text-destructive"
      }`}
    >
      <Icon className="size-3" />
      <span className="tabular">
        {change > 0 ? "+" : ""}
        {change.toFixed(1)}
        {unit}
      </span>
    </span>
  );
}

function KpiCard({
  title,
  hint,
  value,
  change,
  lowerIsBetter,
  unit,
}: {
  title: string;
  hint: string;
  value: string;
  change: number | null;
  lowerIsBetter: boolean;
  unit: string;
}) {
  const { t } = useT();
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="tabular mt-2 font-display text-2xl font-bold">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        <DeltaBadge change={change} lowerIsBetter={lowerIsBetter} unit={unit} />
        <span className="text-xs text-muted-foreground">{t("study.progress.vsPrevious")}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function TrendChart({
  buckets,
  pick,
  unit,
  lowerIsBetter,
}: {
  buckets: Bucket[];
  pick: (b: Bucket) => number | null;
  unit: string;
  lowerIsBetter: boolean;
}) {
  const { t } = useT();
  const rows = buckets
    .map((b) => ({ label: b.label, value: pick(b) }))
    .filter((r): r is { label: string; value: number } => typeof r.value === "number");
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("study.progress.noDataForMetric")}</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 0.001);
  const w = 100;
  const h = 32;
  const step = rows.length > 1 ? w / (rows.length - 1) : 0;
  const path = rows
    .map((r, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(h - (r.value / max) * (h - 4) - 2).toFixed(2)}`)
    .join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-20 w-full">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1" className="text-primary" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 grid gap-1 text-xs" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
        {rows.map((r, i) => {
          const prev = i > 0 ? (rows[i - 1]?.value ?? null) : null;
          const better = prev === null ? null : lowerIsBetter ? r.value < prev : r.value > prev;
          return (
            <div key={r.label} className="min-w-0 text-center">
              <p
                className={`tabular font-semibold ${
                  better === null ? "" : better ? "text-success" : "text-destructive"
                }`}
              >
                {r.value.toFixed(1)}
                {unit}
              </p>
              <p className="truncate text-muted-foreground">{r.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressPage() {
  const { t } = useT();
  const games = useGameHistory();
  const [granularity, setGranularity] = useState<Granularity>("week");

  const buckets = useMemo(() => buildProgress(games, granularity), [games, granularity]);
  const summary = useMemo(() => totals(buckets), [buckets]);
  const lossTrend = useMemo(() => trend(buckets, (b) => b.lossPct), [buckets]);
  const accuracyTrend = useMemo(() => trend(buckets, (b) => b.accuracy), [buckets]);
  const blunderTrend = useMemo(() => trend(buckets, (b) => b.blunders), [buckets]);
  const timeTrend = useMemo(() => trend(buckets, (b) => b.secPerMove), [buckets]);
  const rushTrend = useMemo(
    () => trend(buckets, (b) => (b.rushShare === null ? null : b.rushShare * 100)),
    [buckets],
  );

  const severityTrends = useMemo(
    () =>
      SEVERITIES.map((s) => ({
        severity: s,
        delta: trend(buckets, (b) => (b.points.some((p) => p.severity) ? b.severityPerGame[s] : null)),
      })),
    [buckets],
  );

  const recent = [...buckets].reverse();

  return (
    <AppShell wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("study.progress.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("study.progress.summary", { games: summary.games, moves: summary.moves })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["day", "week", "month"] as Granularity[]).map((g) => (
            <Button
              key={g}
              size="sm"
              variant={granularity === g ? "default" : "outline"}
              onClick={() => setGranularity(g)}
            >
              {g === "day" ? t("study.progress.day") : g === "week" ? t("study.progress.week") : t("study.progress.month")}
            </Button>
          ))}
        </div>
      </div>

      {buckets.length === 0 ? (
        <div className="panel mt-6 p-6 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">{t("study.progress.emptyTitle")}</p>
          <p className="mt-1">
            {(() => {
              const [before, after] = t("study.progress.emptyBody", { link: "\u0000" }).split("\u0000");
              return (
                <>
                  {before}
                  <Link to="/games" className="text-primary underline">
                    {t("study.progress.gameHistoryLink")}
                  </Link>
                  {after}
                </>
              );
            })()}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title={t("study.progress.kpiLossTitle")}
              hint={t("study.progress.kpiLossHint")}
              value={fmt(summary.lossPct, 1, "%")}
              change={lossTrend.change}
              lowerIsBetter
              unit="%"
            />
            <KpiCard
              title={t("study.progress.kpiAccuracyTitle")}
              hint={t("study.progress.kpiAccuracyHint")}
              value={fmt(summary.accuracy, 1, "%")}
              change={accuracyTrend.change}
              lowerIsBetter={false}
              unit="%"
            />
            <KpiCard
              title={t("study.progress.kpiBlunderTitle")}
              hint={t("study.progress.kpiBlunderHint")}
              value={fmt(blunderTrend.after ?? null, 1)}
              change={blunderTrend.change}
              lowerIsBetter
              unit=""
            />
            <KpiCard
              title={t("study.progress.kpiTimeTitle")}
              hint={t("study.progress.kpiTimeHint")}
              value={fmt(summary.secPerMove, 1, "s")}
              change={timeTrend.change}
              lowerIsBetter={false}
              unit="s"
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="panel p-4">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <LineChart className="size-4 text-primary" /> {t("study.progress.chartLossTitle")}
              </h2>
              <div className="mt-3">
                <TrendChart buckets={buckets} pick={(b) => b.lossPct} unit="%" lowerIsBetter />
              </div>
            </div>
            <div className="panel p-4">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <Timer className="size-4 text-primary" /> {t("study.progress.chartTimeTitle")}
              </h2>
              <div className="mt-3">
                <TrendChart
                  buckets={buckets}
                  pick={(b) => b.secPerMove}
                  unit="s"
                  lowerIsBetter={false}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {t("study.progress.rushShare", {
                  value: fmt(summary.rushShare === null ? null : summary.rushShare * 100, 0, "%"),
                })}
                {rushTrend.change !== null && (
                  <>
                    {" "}
                    (<DeltaBadge change={rushTrend.change} lowerIsBetter unit="%" />)
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="panel mt-4 p-4">
            <h2 className="font-display text-base font-semibold">{t("study.progress.mistakesDeclining")}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {severityTrends.map(({ severity, delta }) => (
                <div key={severity} className={`rounded-lg border p-3 ${SEVERITY_META[severity].ring}`}>
                  <p className={`text-xs font-semibold ${SEVERITY_META[severity].tone}`}>
                    {SEVERITY_META[severity].title}
                  </p>
                  <p className="tabular mt-1 text-xl font-bold">{fmt(delta.after, 1)}</p>
                  <p className="text-xs text-muted-foreground">{t("study.progress.perGameLatest")}</p>
                  <div className="mt-1">
                    <DeltaBadge change={delta.change} lowerIsBetter unit="" />
                  </div>
                </div>
              ))}
            </div>
            {summary.coachedGames === 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {t("study.progress.coachedHint")}
              </p>
            )}
          </div>

          <div className="panel mt-4 overflow-x-auto p-4">
            <h2 className="font-display text-base font-semibold">{t("study.progress.detailByPhase")}</h2>
            <table className="mt-3 w-full min-w-[640px] text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="text-right">
                  <th className="pb-2 text-left font-medium">{t("study.progress.colPhase")}</th>
                  <th className="pb-2 font-medium">{t("study.progress.colGames")}</th>
                  <th className="pb-2 font-medium">{t("study.progress.colLoss")}</th>
                  <th className="pb-2 font-medium">{t("study.progress.colAccuracy")}</th>
                  <th className="pb-2 font-medium">{t("study.progress.colInaccuracy")}</th>
                  <th className="pb-2 font-medium">{t("study.progress.colMistake")}</th>
                  <th className="pb-2 font-medium">{t("study.progress.colBlunder")}</th>
                  <th className="pb-2 font-medium">{t("study.progress.colSecPerMove")}</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {recent.map((b) => (
                  <tr key={b.key} className="border-t border-border text-right">
                    <td className="py-2 text-left">{b.label}</td>
                    <td className="py-2">{b.games}</td>
                    <td className="py-2">{fmt(b.lossPct, 1, "%")}</td>
                    <td className="py-2">{fmt(b.accuracy, 1, "%")}</td>
                    <td className="py-2">{fmt(b.inaccuracies, 1)}</td>
                    <td className="py-2">{fmt(b.mistakes, 1)}</td>
                    <td className="py-2">{fmt(b.blunders, 1)}</td>
                    <td className="py-2">{fmt(b.secPerMove, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("study.progress.tableNote")}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/drills">{t("study.progress.trainRemaining")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/games">{t("study.progress.openHistory")}</Link>
            </Button>
          </div>
        </>
      )}
    </AppShell>
  );
}
