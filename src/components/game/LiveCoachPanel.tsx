import { useState } from "react";
import { Eye, Lightbulb, MessageSquare, RotateCcw, Sparkles } from "lucide-react";
import { GamePanel } from "@/components/game/GamePanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { CoachMoment, CoachSeverity } from "@/lib/coach/live/types";

export type CoachSourceBadge = "engine" | "ai" | "quota";

const TONE: Record<CoachSeverity, string> = {
  info: "border-border bg-surface-2",
  major: "border-amber-500/40 bg-amber-500/10",
  critical: "border-destructive/40 bg-destructive/10",
};

export interface LiveCoachPanelProps {
  moment: CoachMoment | null;
  /** Deterministic explanation is ready but the socratic question is showing. */
  analysing: boolean;
  source: CoachSourceBadge;
  history: CoachMoment[];
  canRetry: boolean;
  onRetry: () => void;
  onDismiss: () => void;
  onRevealBest: () => void;
}

export function LiveCoachPanel({
  moment,
  analysing,
  source,
  history,
  canRetry,
  onRetry,
  onDismiss,
  onRevealBest,
}: LiveCoachPanelProps) {
  const { t } = useT();
  // In Teaching / Socratic flow the answer stays hidden until the user asks.
  const [revealed, setRevealed] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const key = moment?.id ?? "none";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setRevealed(false);
    setHintShown(false);
  }

  const showAnswer = !moment?.question || revealed;

  return (
    <GamePanel
      title={t("coachLive.panel")}
      meta={
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-2xs font-bold tracking-wider",
            source === "ai" ? "bg-primary/15 text-primary" : "bg-surface-3 text-muted-foreground",
          )}
        >
          {source === "ai"
            ? t("coachLive.badge.ai")
            : source === "quota"
              ? t("coachLive.badge.quota")
              : t("coachLive.badge.deterministic")}
        </span>
      }
      bodyClassName="space-y-3 p-4"
    >
      {!moment && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <MessageSquare className="mt-0.5 size-4 shrink-0" />
          {analysing ? t("coachLive.analysing") : t("coachLive.idle")}
        </p>
      )}

      {moment && (
        <div className={cn("rounded-md border p-3", TONE[moment.severity])}>
          <p className="text-2xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {t(`coachLive.kind.${moment.kind}`)} · {moment.moveNumber}. {moment.playedSan}
          </p>

          {moment.question && (
            <p className="mt-2 text-sm font-medium">{moment.question}</p>
          )}

          {showAnswer && <p className="mt-2 text-sm leading-relaxed">{moment.message}</p>}

          {hintShown && !showAnswer && (
            <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
              <Lightbulb className="mt-0.5 size-4 shrink-0" />
              {moment.hint}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {!showAnswer && (
              <>
                <Button size="sm" variant="outline" onClick={() => setHintShown(true)}>
                  <Lightbulb className="size-4" /> {t("coachLive.hint")}
                </Button>
                <Button size="sm" onClick={() => setRevealed(true)}>
                  <Eye className="size-4" /> {t("coachLive.reveal")}
                </Button>
              </>
            )}
            {showAnswer && moment.bestUci && (
              <Button size="sm" variant="outline" onClick={onRevealBest}>
                <Sparkles className="size-4" /> {t("coachLive.showBest")}
              </Button>
            )}
            {moment.retryable && canRetry && (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                <RotateCcw className="size-4" /> {t("coachLive.retry")}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              {t("coachLive.dismiss")}
            </Button>
          </div>
        </div>
      )}

      <div>
        <p className="text-2xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {t("coachLive.log")}
        </p>
        {history.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">{t("coachLive.logEmpty")}</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {history.map((m) => (
              <li key={m.id} className="flex items-baseline gap-2 text-xs">
                <span className="font-mono text-muted-foreground">
                  {m.moveNumber}. {m.playedSan}
                </span>
                <span className="truncate">{t(`coachLive.kind.${m.kind}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </GamePanel>
  );
}
