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

export const Route = createFileRoute("/insights")({
  head: () =>
    pageHead({
      path: "/insights",
      title: `Insights & lộ trình luyện tập — ${APP.name}`,
      description:
        "Cây khai cuộc cá nhân, hồ sơ điểm yếu theo từng giai đoạn, dự báo elo và bot phù hợp để luyện đúng chỗ yếu.",
    }), : []), [node]);
  const weakestLine = useMemo(() => worstLine(tree), [tree]);
  const recommendation = useMemo(
    () => recommendTraining(profile, learn.bandit),
    [profile, learn.bandit],
  );

  const labelRows = (Object.entries(profile.labels) as [MoveLabel, number][]).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <AppShell wide>
      <h1 className="text-2xl font-bold">Insights</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Built from {profile.reviewedGames} reviewed game{profile.reviewedGames === 1 ? "" : "s"} ·{" "}
        {profile.plies} of your moves analysed.
      </p>

      {profile.reviewedGames === 0 ? (
        <div className="panel mt-6 p-6 text-center">
          <Activity className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">No analysed games yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Run an engine review on a saved game — the weakness profile, opening tree and training
            plan all come from your own moves.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/games">Open my games</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-4">
            <Stat
              label="Estimated strength"
              value={profile.estimatedRating === null ? "—" : String(profile.estimatedRating)}
              note="From complexity-weighted ACPL"
            />
            <Stat
              label="Forecast (10 games)"
              value={profile.forecast === null ? "—" : String(profile.forecast)}
              note={`${profile.trend >= 0 ? "+" : ""}${profile.trend} / game`}
              icon={profile.trend >= 0 ? TrendingUp : TrendingDown}
              tone={profile.trend >= 0 ? "text-primary" : "text-destructive"}
            />
            <Stat label="Avg win% lost / move" value={`${profile.avgLoss}%`} note="Lower is better" />
            <Stat
              label="Weakest phase"
              value={profile.weakestPhase ? cap(profile.weakestPhase) : "—"}
              note="Highest average loss"
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="panel p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <Activity className="size-4 text-primary" /> Phase breakdown
              </h2>
              <div className="mt-4 space-y-3">
                {profile.phases.map((p) => {
                  const width = Math.min(100, p.avgLoss * 6);
                  return (
                    <div key={p.phase}>
                      <div className="flex items-center justify-between text-sm">
                        <span>{cap(p.phase)}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {p.avgLoss}% · {p.blunders} blunders · {p.plies} moves
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
                Motifs you keep missing
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {profile.missedMotifs.length === 0 ? (
                  <span className="text-sm text-muted-foreground">No repeated pattern yet.</span>
                ) : (
                  profile.missedMotifs.map((m) => (
                    <span key={m.motif} className="rounded bg-secondary px-2 py-0.5 text-2xs">
                      {m.label} ×{m.count}
                    </span>
                  ))
                )}
              </div>

              <h3 className="mt-5 text-xs uppercase tracking-wider text-muted-foreground">
                Move quality
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
                <Bot className="size-4 text-primary" /> Recommended sparring
              </h2>
              {recommendation ? (
                <>
                  <p className="mt-3 text-lg font-semibold">
                    Level {recommendation.level} · {recommendation.title} as{" "}
                    {recommendation.personalityName}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{recommendation.reason}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Chosen by an exploration/exploitation bandit that keeps your results near a coin
                    flip while targeting your weakest phase.
                  </p>
                  <Button asChild className="mt-4">
                    <Link to="/play/ai">
                      Play this bot <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Not enough data yet.</p>
              )}

              <h3 className="mt-6 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <GitBranch className="size-3.5" /> Weakest opening line
              </h3>
              {weakestLine ? (
                <p className="mt-2 text-sm">
                  <span className="font-mono">{weakestLine.path}</span> — {weakestLine.games} games,{" "}
                  {weakestLine.winRate}% score, avg loss {weakestLine.avgLoss}%
                  {weakestLine.openingName ? ` (${weakestLine.openingName})` : ""}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Play a few more games to build the tree.
                </p>
              )}
            </section>
          </div>

          <section className="panel mt-6 p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <GitBranch className="size-4 text-primary" /> Your opening tree
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-1 text-sm">
              <button className="text-primary hover:underline" onClick={() => setPath("")}>
                start
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
              <p className="mt-4 text-sm text-muted-foreground">No continuations recorded here.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Move</th>
                      <th className="py-2 text-left">Opening</th>
                      <th className="py-2 text-right">Games</th>
                      <th className="py-2 text-right">Score</th>
                      <th className="py-2 text-right">Avg loss</th>
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
                            Open
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
