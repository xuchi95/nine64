import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Brain, CalendarCheck, HelpCircle, TrendingDown, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";
import {
  getBrainSnapshot,
  getWeeklyReport,
  saveTrainingSession,
} from "@/lib/brain.functions";
import { buildPlayerProfile, STRONG_CONFIDENCE, type Dimension } from "@/lib/brain/profile";
import {
  generateDailyPlan,
  isFatigued,
  PLAN_BUDGETS,
  type DailyPlan,
  type FatigueSignal,
  type PlanBlock,
  type PlanBudget,
} from "@/lib/brain/plan";

export const Route = createFileRoute("/_authenticated/training-plan")({
  head: () =>
    pageHead({
      path: "/training-plan",
      title: `Kế hoạch tập luyện cá nhân — ${APP.name}`,
      description:
        "Kế hoạch luyện cờ vua 10–45 phút mỗi ngày, tự điều chỉnh theo hồ sơ kỹ năng, thẻ ôn đến hạn và các ván gần đây của bạn.",
    }),
  component: TrainingPlanPage,
});

type Tab = "plan" | "profile" | "weekly";
type BlockStatus = "pending" | "completed" | "failed";

const BUDGET_KEY = "nine64.training.budget";
const DAY = 86_400_000;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fatigueFrom(
  sessions: { date: string; failedBlocks: number; completedBlocks: number }[],
): FatigueSignal {
  const now = Date.now();
  const recent = sessions.filter((s) => now - Date.parse(`${s.date}T12:00:00.000Z`) <= 3 * DAY);
  let streak = 0;
  for (let i = 1; i <= 14; i += 1) {
    const day = new Date(now - i * DAY).toISOString().slice(0, 10);
    if (sessions.some((s) => s.date === day && s.completedBlocks > 0)) streak += 1;
    else break;
  }
  return {
    recentSessions: recent.length,
    recentFailures: recent.reduce((n, s) => n + s.failedBlocks, 0),
    streakDays: streak,
  };
}

function ScoreBar({ value }: { value: number }) {
  const tone = value >= 65 ? "bg-primary" : value >= 45 ? "bg-amber-500" : "bg-destructive";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
    </div>
  );
}

function TrainingPlanPage() {
  const { t, locale } = useT();
  const fetchSnapshot = useServerFn(getBrainSnapshot);
  const fetchWeekly = useServerFn(getWeeklyReport);
  const saveSession = useServerFn(saveTrainingSession);

  const [tab, setTab] = useState<Tab>("plan");
  const [budget, setBudget] = useState<PlanBudget>(20);
  const [statuses, setStatuses] = useState<Record<string, BlockStatus>>({});
  const [openWhy, setOpenWhy] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(BUDGET_KEY);
    const parsed = Number(raw);
    if (PLAN_BUDGETS.includes(parsed as PlanBudget)) setBudget(parsed as PlanBudget);
  }, []);

  const snapshot = useQuery({ queryKey: ["brain-snapshot"], queryFn: () => fetchSnapshot() });
  const weekly = useQuery({
    queryKey: ["brain-weekly", locale],
    queryFn: () => fetchWeekly({ data: { locale, narrative: true } }),
    enabled: tab === "weekly",
    staleTime: 10 * 60 * 1000,
  });

  const profile = useMemo(
    () => buildPlayerProfile({ events: snapshot.data?.events ?? [], games: snapshot.data?.games ?? [] }),
    [snapshot.data],
  );

  const plan: DailyPlan | null = useMemo(() => {
    if (!snapshot.data) return null;
    const fatigue = fatigueFrom(snapshot.data.sessions);
    return generateDailyPlan({
      profile,
      dueCards: snapshot.data.dueCards,
      retryCandidates: snapshot.data.retryCandidates,
      rating: snapshot.data.rating,
      budget,
      fatigue,
      date: todayIso(),
    });
  }, [snapshot.data, profile, budget]);

  const fatigued = snapshot.data ? isFatigued(fatigueFrom(snapshot.data.sessions)) : false;

  async function mark(block: PlanBlock, status: BlockStatus) {
    if (!plan) return;
    const next = { ...statuses, [block.id]: status };
    setStatuses(next);
    const results = plan.blocks
      .filter((b) => next[b.id] && next[b.id] !== "pending")
      .map((b) => ({ blockId: b.id, kind: b.kind, status: next[b.id] as "completed" | "failed" }));
    const minutesSpent = plan.blocks
      .filter((b) => next[b.id] === "completed")
      .reduce((n, b) => n + b.minutes, 0);
    try {
      await saveSession({
        data: {
          day: plan.date,
          budgetMinutes: plan.budget,
          minutesSpent,
          plan: { blocks: plan.blocks.map((b) => ({ id: b.id, kind: b.kind, minutes: b.minutes })) },
          results,
          status: results.length === plan.blocks.length ? "completed" : "active",
        },
      });
      setSaveMsg(t("brain.plan.saved"));
      void snapshot.refetch();
    } catch {
      setSaveMsg(t("brain.plan.saveError"));
    }
  }

  const reasonText = (block: PlanBlock) => {
    const params = { ...block.reason.params } as Record<string, string | number>;
    if (typeof params['dimension'] === "string") {
      params['dimension'] = t(`brain.dim.${params['dimension']}`);
    }
    return t(`brain.reason.${block.reason.code}`, params);
  };

  const trendIcon = (d: Dimension) =>
    d.trend === "up" ? (
      <TrendingUp className="size-3.5 text-primary" aria-hidden />
    ) : d.trend === "down" ? (
      <TrendingDown className="size-3.5 text-destructive" aria-hidden />
    ) : null;

  return (
    <AppShell wide>
      <div className="flex items-center gap-2">
        <Brain className="size-5 text-primary" aria-hidden />
        <h1 className="font-display text-2xl font-bold">{t("brain.title")}</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("brain.subtitle")}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {(["plan", "profile", "weekly"] as Tab[]).map((id) => (
          <Button
            key={id}
            size="sm"
            variant={tab === id ? "default" : "outline"}
            onClick={() => setTab(id)}
          >
            {t(`brain.tab.${id}`)}
          </Button>
        ))}
      </div>

      {snapshot.isLoading && <p className="mt-6 text-sm text-muted-foreground">{t("brain.loading")}</p>}
      {snapshot.error && <p className="mt-6 text-sm text-destructive">{t("brain.error")}</p>}

      {tab === "plan" && plan && (
        <section className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("brain.plan.budget")}</span>
            {PLAN_BUDGETS.map((b) => (
              <Button
                key={b}
                size="sm"
                variant={budget === b ? "default" : "outline"}
                onClick={() => {
                  setBudget(b);
                  window.localStorage.setItem(BUDGET_KEY, String(b));
                }}
              >
                {t("brain.plan.minutes", { n: b })}
              </Button>
            ))}
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {t("brain.plan.total", { n: plan.totalMinutes })}
            </span>
          </div>

          {fatigued && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              {t("brain.plan.fatigue")}
            </p>
          )}

          <ol className="space-y-3">
            {plan.blocks.map((block) => {
              const status = statuses[block.id] ?? "pending";
              return (
                <li key={block.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <CalendarCheck className="size-4 text-primary" aria-hidden />
                    <h2 className="font-display text-base font-semibold">
                      {t(`brain.block.${block.kind}`)}
                    </h2>
                    <span className="font-mono text-xs text-muted-foreground">
                      {t("brain.plan.minutes", { n: block.minutes })}
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      {t(`brain.plan.difficulty.${block.difficulty}`)}
                    </span>
                    {block.targetDimension && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                        {t(`brain.dim.${block.targetDimension}`)}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button asChild size="sm">
                      <Link to={block.route as never}>{t("brain.plan.start")}</Link>
                    </Button>
                    <Button
                      size="sm"
                      variant={status === "completed" ? "default" : "outline"}
                      onClick={() => void mark(block, "completed")}
                    >
                      {t("brain.plan.done")}
                    </Button>
                    <Button
                      size="sm"
                      variant={status === "failed" ? "destructive" : "outline"}
                      onClick={() => void mark(block, "failed")}
                    >
                      {t("brain.plan.failed")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setOpenWhy(openWhy === block.id ? null : block.id)}
                      aria-expanded={openWhy === block.id}
                    >
                      <HelpCircle className="mr-1 size-4" aria-hidden />
                      {t("brain.plan.why")}
                    </Button>
                  </div>

                  {openWhy === block.id && (
                    <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                      {reasonText(block)}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          {saveMsg && <p className="text-sm text-muted-foreground">{saveMsg}</p>}
        </section>
      )}

      {tab === "profile" && (
        <section className="mt-6">
          {profile.totalEvents === 0 ? (
            <p className="text-sm text-muted-foreground">{t("brain.profile.empty")}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {profile.dimensions.map((d) => (
                <li key={d.key} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-sm font-semibold">{t(`brain.dim.${d.key}`)}</h2>
                    {trendIcon(d)}
                    <span className="ml-auto font-mono text-lg">{d.score}</span>
                  </div>
                  <div className="mt-2">
                    <ScoreBar value={d.score} />
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px] text-muted-foreground">
                    <div>
                      <dt>{t("brain.profile.confidence")}</dt>
                      <dd>{d.confidence}%</dd>
                    </div>
                    <div>
                      <dt>{t("brain.profile.sample")}</dt>
                      <dd>{d.sample}</dd>
                    </div>
                    <div>
                      <dt>{t("brain.profile.updated")}</dt>
                      <dd>{d.updatedAt ? d.updatedAt.slice(0, 10) : t("brain.profile.never")}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {d.confidence < STRONG_CONFIDENCE
                      ? t("brain.profile.lowConfidence")
                      : t(`brain.trend.${d.trend}`)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "weekly" && (
        <section className="mt-6 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold">{t("brain.weekly.title")}</h2>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => void weekly.refetch()}>
              {t("brain.weekly.refresh")}
            </Button>
          </div>

          {weekly.isFetching && <p className="text-sm text-muted-foreground">{t("brain.loading")}</p>}
          {weekly.error && <p className="text-sm text-destructive">{t("brain.error")}</p>}

          {weekly.data && (
            <div className="space-y-4">
              {weekly.data.report.lowData && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                  {t("brain.weekly.lowData")}
                </p>
              )}

              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="font-display text-sm font-semibold">{t("brain.weekly.activity")}</h3>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {t("brain.weekly.activityLine", {
                    sessions: weekly.data.report.activity.sessions,
                    minutes: weekly.data.report.activity.minutes,
                    games: weekly.data.report.activity.games,
                    events: weekly.data.report.activity.events,
                  })}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="font-display text-sm font-semibold">{t("brain.weekly.improved")}</h3>
                  {weekly.data.report.improved.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">{t("brain.weekly.none")}</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                      {weekly.data.report.improved.map((s) => (
                        <li key={s.key}>
                          {t(`brain.dim.${s.key}`)} <span className="font-mono text-primary">+{s.delta}</span>{" "}
                          <span className="font-mono text-xs text-muted-foreground">
                            ({s.before} → {s.after})
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="font-display text-sm font-semibold">{t("brain.weekly.declining")}</h3>
                  {weekly.data.report.declining.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">{t("brain.weekly.none")}</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                      {weekly.data.report.declining.map((s) => (
                        <li key={s.key}>
                          {t(`brain.dim.${s.key}`)}{" "}
                          <span className="font-mono text-destructive">{s.delta}</span>{" "}
                          <span className="font-mono text-xs text-muted-foreground">
                            ({s.before} → {s.after})
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="font-display text-sm font-semibold">{t("brain.weekly.recurring")}</h3>
                {weekly.data.report.recurringMistakes.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">{t("brain.weekly.none")}</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                    {weekly.data.report.recurringMistakes.map((m) => (
                      <li key={m.skillKey} className="rounded-full border border-border px-2 py-0.5 font-mono">
                        {m.skillKey} ×{m.count}
                      </li>
                    ))}
                  </ul>
                )}
                {weekly.data.report.openingLeak && (
                  <p className="mt-3 text-sm">
                    {t("brain.weekly.openingLeak")}:{" "}
                    <span className="font-mono">{weekly.data.report.openingLeak.skillKey}</span> ×
                    {weekly.data.report.openingLeak.count}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="font-display text-sm font-semibold">{t("brain.weekly.focus")}</h3>
                <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                  {weekly.data.report.recommendedFocus.map((k) => (
                    <li key={k} className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                      {t(`brain.dim.${k}`)}
                    </li>
                  ))}
                </ul>
              </div>

              {weekly.data.summary && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="font-display text-sm font-semibold">{t("brain.weekly.summary")}</h3>
                  <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                    {weekly.data.summary}
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground">{t("brain.weekly.summaryNote")}</p>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </AppShell>
  );
}
