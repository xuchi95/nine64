import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Lightbulb, ShieldAlert, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { coachGame } from "@/lib/coach.functions";
import { buildCoachDigest } from "@/lib/coach/digest";
import { SEVERITY_META, type CoachReport } from "@/lib/coach/types";
import { attachCoach, type SavedGame } from "@/lib/history";
import { useT, getLocale } from "@/lib/i18n";
import { parseRateLimited, rateLimitMessage } from "@/lib/ratelimit/errors";

interface Props {
  game: SavedGame;
  onSelectMove?: (plyIndex: number) => void;
}

type Phase = "opening" | "middlegame" | "endgame";
const PHASES: Phase[] = ["opening", "middlegame", "endgame"];

export function CoachPanel({ game, onSelectMove }: Props) {
  const { t } = useT();
  const runCoach = useServerFn(coachGame);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("opening");
  const side = game.playerColor ?? "w";
  const report = game.coach ?? null;

  /** Up to three lessons — the rest stays in the turning points panel. */
  const lessons = useMemo(() => {
    if (!report) return [];
    return [...report.mistakes]
      .sort(
        (a, b) =>
          SEVERITY_META[b.severity].order - SEVERITY_META[a.severity].order ||
          a.moveNumber - b.moveNumber,
      )
      .slice(0, 3);
  }, [report]);

  /** The engine data moved on after this explanation was written. */
  const stale = Boolean(
    report?.sourceReviewedAt &&
      game.review?.reviewedAt &&
      report.sourceReviewedAt !== game.review.reviewedAt,
  );

  async function generate() {
    setPending(true);
    setError(null);
    try {
      const digest = buildCoachDigest(game, side);
      const result = (await runCoach({ data: { digest, locale: getLocale() } })) as CoachReport;
      attachCoach(game.id, result);
    } catch (err) {
      const limited = parseRateLimited(err);
      setError(
        limited
          ? rateLimitMessage(limited, getLocale())
          : err instanceof Error
            ? err.message
            : t("game.coach.errorToast"),
      );
    } finally {
      setPending(false);
    }
  }

  const phaseText = report ? report.phases[phase] : "";
  const phaseFallback =
    phase === "endgame" ? t("game.coach.noEndgame") : t("game.coach.noPhaseNote");

  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Brain className="size-4 text-primary" aria-hidden /> {t("game.coach.title")}
        </h2>
        {report && !stale && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => void generate()}>
            {pending ? t("game.coach.analysing") : t("game.coach.reanalyse")}
          </Button>
        )}
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!report && (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">
            {t("game.coach.intro")}
            {!game.review && t("game.coach.introReviewHint")}
          </p>
          <Button className="mt-3 w-full" disabled={pending} onClick={() => void generate()}>
            <Sparkles className="size-4" aria-hidden />
            {pending ? t("game.coach.analysing") : t("game.coach.generate")}
          </Button>
        </div>
      )}

      {report && (
        <div className="mt-3 space-y-4 text-sm">
          {stale && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
              <p className="text-xs text-warning">{t("game.coach.stale")}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={pending}
                onClick={() => void generate()}
              >
                {pending ? t("game.coach.analysing") : t("game.coach.refresh")}
              </Button>
            </div>
          )}

          <div className="rounded-md bg-surface-2 p-3">
            <p className="font-display text-base font-bold leading-snug">{report.headline}</p>
            {report.verdict && (
              <p className="mt-2 whitespace-pre-line text-muted-foreground">{report.verdict}</p>
            )}
            {report.levelImpression && (
              <p className="mt-2 text-xs text-muted-foreground">{report.levelImpression}</p>
            )}
          </div>

          {/* Phase notes as tabs: one full-width column, never three narrow ones. */}
          <div>
            <div role="tablist" aria-label={t("game.coach.title")} className="flex flex-wrap gap-1">
              {PHASES.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  id={`coach-phase-tab-${p}`}
                  aria-selected={phase === p}
                  aria-controls={`coach-phase-panel-${p}`}
                  onClick={() => setPhase(p)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    phase === p
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(
                    p === "opening"
                      ? "game.coach.phaseOpening"
                      : p === "middlegame"
                        ? "game.coach.phaseMiddlegame"
                        : "game.coach.phaseEndgame",
                  )}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id={`coach-phase-panel-${phase}`}
              aria-labelledby={`coach-phase-tab-${phase}`}
              className="mt-2 rounded-md border border-border bg-surface-2 p-3 text-muted-foreground"
            >
              {phaseText || phaseFallback}
            </div>
          </div>

          {lessons.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ShieldAlert className="size-4 text-destructive" aria-hidden />{" "}
                {t("game.coach.lessons")}
              </p>
              <ul className="space-y-2">
                {lessons.map((m, i) => {
                  const meta = SEVERITY_META[m.severity];
                  const plyIndex =
                    m.plyIndex ?? Math.max(0, (m.moveNumber - 1) * 2 + (side === "w" ? 0 : 1));
                  return (
                    <li key={m.momentId ?? i} className={`rounded-md border p-3 ${meta.ring}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-xs font-semibold uppercase tracking-wider ${meta.tone}`}
                        >
                          {meta.title}
                        </span>
                        <button
                          type="button"
                          className="tabular rounded bg-background/60 px-1.5 py-0.5 text-xs font-semibold hover:text-primary"
                          onClick={() => onSelectMove?.(plyIndex)}
                        >
                          {m.moveNumber}. {m.san}
                        </button>
                      </div>
                      <p className="mt-1 font-medium">{m.title}</p>
                      {m.whatHappened && (
                        <p className="mt-1 text-muted-foreground">{m.whatHappened}</p>
                      )}
                      {m.betterPlan && (
                        <p className="mt-1 text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {t("game.coach.betterPlan")}
                          </span>
                          {m.betterPlan}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <Accordion type="single" collapsible className="w-full">
            {report.strengths.length > 0 && (
              <AccordionItem value="strengths">
                <AccordionTrigger className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Target className="size-4 text-primary" aria-hidden />{" "}
                    {t("game.coach.strengths")}
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-1">
                    {report.strengths.map((s, i) => (
                      <li key={i} className="text-muted-foreground">
                        • {s}
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            )}

            {report.habits.length > 0 && (
              <AccordionItem value="habits">
                <AccordionTrigger className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <ShieldAlert className="size-4 text-warning" aria-hidden />{" "}
                    {t("game.coach.habits")}
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-1">
                    {report.habits.map((h, i) => (
                      <li key={i} className="text-muted-foreground">
                        • {h}
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            )}

            {(report.advice.length > 0 || report.drills.length > 0) && (
              <AccordionItem value="advice">
                <AccordionTrigger className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Lightbulb className="size-4 text-accent" aria-hidden />{" "}
                    {t("game.coach.advice")}
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <ol className="space-y-1">
                    {report.advice.map((a, i) => (
                      <li key={i} className="text-muted-foreground">
                        {i + 1}. {a}
                      </li>
                    ))}
                  </ol>
                  {report.drills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {report.drills.map((d, i) => (
                        <span
                          key={i}
                          className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>

          <p className="text-2xs text-muted-foreground">{t("game.coach.disclaimer")}</p>
        </div>
      )}
    </section>
  );
}
