import { useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Lightbulb, ShieldAlert, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export function CoachPanel({ game, onSelectMove }: Props) {
  const { t } = useT();
  const runCoach = useServerFn(coachGame);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const side = game.playerColor ?? "w";
  const report = game.coach ?? null;

  const mistakes = useMemo(() => {
    if (!report) return [];
    return [...report.mistakes].sort(
      (a, b) =>
        SEVERITY_META[a.severity].order - SEVERITY_META[b.severity].order ||
        a.moveNumber - b.moveNumber,
    );
  }, [report]);

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

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Brain className="size-4 text-primary" /> {t("game.coach.title")}
        </h2>
        {report && (
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
            <Sparkles className="size-4" />
            {pending ? t("game.coach.analysing") : t("game.coach.generate")}
          </Button>
        </div>
      )}

      {report && (
        <div className="mt-3 space-y-4 text-sm">
          <div className="rounded-md bg-surface-2 p-3">
            <p className="font-display text-base font-bold leading-snug">{report.headline}</p>
            {report.verdict && (
              <p className="mt-2 text-muted-foreground whitespace-pre-line">{report.verdict}</p>
            )}
            {report.levelImpression && (
              <p className="mt-2 text-xs text-muted-foreground">{report.levelImpression}</p>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <PhaseCard label={t("game.coach.phaseOpening")} text={report.phases.opening} />
            <PhaseCard label={t("game.coach.phaseMiddlegame")} text={report.phases.middlegame} />
            <PhaseCard label={t("game.coach.phaseEndgame")} text={report.phases.endgame} />
          </div>

          {report.strengths.length > 0 && (
            <Section icon={<Target className="size-4 text-primary" />} title={t("game.coach.strengths")}>
              <ul className="space-y-1">
                {report.strengths.map((s, i) => (
                  <li key={i} className="text-muted-foreground">
                    • {s}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {mistakes.length > 0 && (
            <Section
              icon={<ShieldAlert className="size-4 text-destructive" />}
              title={t("game.coach.mistakesTitle")}
            >
              <ul className="space-y-2">
                {mistakes.map((m, i) => {
                  const meta = SEVERITY_META[m.severity];
                  const plyIndex = Math.max(
                    0,
                    (m.moveNumber - 1) * 2 + (side === "w" ? 0 : 1),
                  );
                  return (
                    <li key={i} className={`rounded-md border p-3 ${meta.ring}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs font-semibold uppercase tracking-wider ${meta.tone}`}>
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
                          <span className="font-medium text-foreground">{t("game.coach.betterPlan")}</span>
                          {m.betterPlan}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {report.habits.length > 0 && (
            <Section icon={<ShieldAlert className="size-4 text-warning" />} title={t("game.coach.habits")}>
              <ul className="space-y-1">
                {report.habits.map((h, i) => (
                  <li key={i} className="text-muted-foreground">
                    • {h}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {report.advice.length > 0 && (
            <Section icon={<Lightbulb className="size-4 text-accent" />} title={t("game.coach.advice")}>
              <ol className="space-y-1">
                {report.advice.map((a, i) => (
                  <li key={i} className="text-muted-foreground">
                    {i + 1}. {a}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {report.drills.length > 0 && (
            <Section icon={<Target className="size-4 text-primary" />} title={t("game.coach.drills")}>
              <div className="flex flex-wrap gap-2">
                {report.drills.map((d, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs"
                  >
                    {d}
                  </span>
                ))}
              </div>
            </Section>
          )}

          <p className="text-2xs text-muted-foreground">
{t("game.coach.disclaimer")}
          </p>
        </div>
      )}
    </div>
  );
}

function PhaseCard({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-muted-foreground">{text}</p>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {title}
      </p>
      {children}
    </div>
  );
}
