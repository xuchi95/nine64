import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Activity, Bot, ChevronRight, GitBranch, TrendingDown, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { useGameHistory } from "@/lib/history";
import { buildOpeningTree, childRows, nodeAtPath, worstLine } from "@/lib/openings/tree";
import { buildWeaknessProfile, recommendTraining } from "@/lib/insights/profile";
import { hydrateLearn, useLearnState } from "@/lib/learn/store";
import { LABEL_META, type MoveLabel } from "@/lib/analysis/classify";
import { DashboardSkeleton } from "@/components/layout/PageSkeleton";
import { pageHead } from "@/lib/seo";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/insights")({
  head: () =>
    pageHead({
      path: "/insights",
      title: `Insights & lộ trình luyện tập — ${APP.name}`,
      description:
        "Cây khai cuộc cá nhân, hồ sơ điểm yếu theo từng giai đoạn, dự báo elo và bot phù hợp để luyện đúng chỗ yếu.",
    }),
  pendingComponent: DashboardSkeleton,
  component: InsightsPage,
});

function InsightsPage() {
  const { t } = useT();
  const games = useGameHistory();
  const learn = useLearnState();
  const [path, setPath] = useState("");

  useEffect(() => {
    hydrateLearn();
  }, []);

  const profile = useMemo(() => buildWeaknessProfile(games), [games]);
  const tree = useMemo(() => buildOpeningTree(games), [games]);
  const node = useMemo(() => nodeAtPath(tree, path), [tree, path]);
  const rows = useMemo(() => (node ? childRows(node) : []), [node]);
  const weakestLine = useMemo(() => worstLine(tree), [tree]);
  const recommendation = useMemo(
    () => recommendTraining(profile, learn.bandit),
    [profile, learn.bandit],
  );

  const labelRows = (Object.entries(profile.labels) as [MoveLabel, number][]).sort(
    (a, b) => b[1] - a[1],
  );

  const phaseLabel = (phase: string) =>
    phase === "opening"
      ? t("study.insights.phaseOpening")
      : phase === "middlegame"
        ? t("study.insights.phaseMiddlegame")
        : phase === "endgame"
          ? t("study.insights.phaseEndgame")
          : cap(phase);

  return (
    <AppShell wide>
      <h1 className="text-2xl font-bold">{t("study.insights.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("study.insights.summary", {
          n: profile.reviewedGames,
          plural: profile.reviewedGames === 1 ? "" : "s",
          plies: profile.plies,
        })}
      </p>

      {profile.reviewedGames === 0 ? (
        <div className="panel mt-6 p-6 text-center">
          <Activity className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">{t("study.insights.emptyTitle")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {t("study.insights.emptyBody")}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/games">{t("study.insights.openGames")}</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-4">
            <Stat
              label={t("study.insights.statStrength")}
              value={profile.estimatedRating === null ? "—" : String(profile.estimatedRating)}
              note={t("study.insights.statStrengthNote")}
            />
            <Stat
              label={t("study.insights.statForecast")}
              value={profile.forecast === null ? "—" : String(profile.forecast)}
              note={t("study.insights.statForecastNote", {
                sign: profile.trend >= 0 ? "+" : "",
                trend: profile.trend,
              })}
              icon={profile.trend >= 0 ? TrendingUp : TrendingDown}
              tone={profile.trend >= 0 ? "text-primary" : "text-destructive"}
            />
            <Stat
              label={t("study.insights.statAvgLoss")}
              value={`${profile.avgLoss}%`}
              note={t("study.insights.statAvgLossNote")}
            />
            <Stat
              label={t("study.insights.statWeakestPhase")}
              value={profile.weakestPhase ? phaseLabel(profile.weakestPhase) : "—"}
              note={t("study.insights.statWeakestPhaseNote")}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="panel p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <Activity className="size-4 text-primary" /> {t("study.insights.phaseBreakdown")}
              </h2>
              <div className="mt-4 space-y-3">
                {profile.phases.map((p) => {
                  const width = Math.min(100, p.avgLoss * 6);
                  return (
                    <div key={p.phase}>
                      <div className="flex items-center justify-between text-sm">
                        <span>{phaseLabel(p.phase)}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {t("study.insights.phaseStats", {
                            avgLoss: p.avgLoss,
                            blunders: p.blunders,
                            plies: p.plies,
                          })}
                        </span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-secondary">
                        <div
                          className="h-2 rounded-full bg-primary/70"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <h3 className="mt-5 text-xs uppercase tracking-wider text-muted-foreground">
                {t("study.insights.missedMotifs")}
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {profile.missedMotifs.length === 0 ? (
                  <span className="text-sm text-muted-foreground">{t("study.insights.noPattern")}</span>
                ) : (
                  profile.missedMotifs.map((m) => (
                    <span key={m.motif} className="rounded bg-secondary px-2 py-0.5 text-2xs">
                      {m.label} ×{m.count}
                    </span>
                  ))
                )}
              </div>

              <h3 className="mt-5 text-xs uppercase tracking-wider text-muted-foreground">
                {t("study.insights.moveQuality")}
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {labelRows.map(([label, count]) => (
                  <span key={label} className="rounded bg-secondary px-2 py-0.5 text-2xs">
                    {LABEL_META[label]?.symbol} {LABEL_META[label]?.title ?? label} ×{count}
                  </span>
                ))}
              </div>
            </section>

            <section className="panel p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <Bot className="size-4 text-primary" /> {t("study.insights.recommendedSparring")}
              </h2>
              {recommendation ? (
                <>
                  <p className="mt-3 text-lg font-semibold">
                    {t("study.insights.recommendationLevel", {
                      level: recommendation.level,
                      title: recommendation.title,
                      personality: recommendation.personalityName,
                    })}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{recommendation.reason}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("study.insights.recommendationHint")}
                  </p>
                  <Button asChild className="mt-4">
                    <Link to="/play/ai">
                      {t("study.insights.playThisBot")} <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">{t("study.insights.notEnoughData")}</p>
              )}

              <h3 className="mt-6 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <GitBranch className="size-3.5" /> {t("study.insights.weakestLine")}
              </h3>
              {weakestLine ? (
                <p className="mt-2 text-sm">
                  <span className="font-mono">{weakestLine.path}</span> —{" "}
                  {t("study.insights.weakestLineStats", {
                    path: weakestLine.path,
                    games: weakestLine.games,
                    winRate: weakestLine.winRate,
                    avgLoss: weakestLine.avgLoss ?? 0,
                    opening: weakestLine.openingName ? ` (${weakestLine.openingName})` : "",
                  })}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("study.insights.playMoreGames")}
                </p>
              )}
            </section>
          </div>

          <section className="panel mt-6 p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <GitBranch className="size-4 text-primary" /> {t("study.insights.openingTree")}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-1 text-sm">
              <button className="text-primary hover:underline" onClick={() => setPath("")}>
                {t("study.insights.start")}
              </button>
              {path
                ? path.split(" ").map((san, i, arr) => (
                    <span key={`${san}-${i}`} className="flex items-center gap-1">
                      <ChevronRight className="size-3 text-muted-foreground" />
                      <button
                        className="font-mono text-primary hover:underline"
                        onClick={() => setPath(arr.slice(0, i + 1).join(" "))}
                      >
                        {san}
                      </button>
                    </span>
                  ))
                : null}
            </div>

            {rows.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">{t("study.insights.noContinuations")}</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">{t("study.insights.colMove")}</th>
                      <th className="py-2 text-left">{t("study.insights.colOpening")}</th>
                      <th className="py-2 text-right">{t("study.insights.colGames")}</th>
                      <th className="py-2 text-right">{t("study.insights.colScore")}</th>
                      <th className="py-2 text-right">{t("study.insights.colAvgLoss")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.path} className="border-t border-border/60">
                        <td className="py-2 font-mono">{row.san}</td>
                        <td className="py-2 text-muted-foreground">{row.openingName ?? "—"}</td>
                        <td className="py-2 text-right font-mono">{row.games}</td>
                        <td className="py-2 text-right font-mono">{row.winRate}%</td>
                        <td className="py-2 text-right font-mono">
                          {row.avgLoss === null ? "—" : `${row.avgLoss}%`}
                        </td>
                        <td className="py-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setPath(row.path)}>
                            {t("study.insights.open")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Stat({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: string;
}) {
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 flex items-center gap-1.5 font-mono text-xl ${tone ?? ""}`}>
        {Icon && <Icon className="size-4" />}
        {value}
      </div>
      {note && <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}
