import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Chess } from "chess.js";
import { Brain, Check, RefreshCw, X } from "lucide-react";
import { OpeningBoard, pathLabel } from "@/components/openings/OpeningBoard";
import { GamePanel } from "@/components/game/GamePanel";
import { Button } from "@/components/ui/button";
import { getPracticeQueue, gradePracticeCard } from "@/lib/openings/practice.functions";
import type { PracticeCard, RepertoireColor } from "@/lib/openings/repertoireTypes";
import { useT } from "@/lib/i18n";

type Phase = "asking" | "correct" | "wrong";

const SLOW_MS = 8_000;

export function PracticeTab({ signedIn }: { signedIn: boolean }) {
  const { t } = useT();
  const queueFn = useServerFn(getPracticeQueue);
  const gradeFn = useServerFn(gradePracticeCard);

  const [color, setColor] = useState<RepertoireColor | null>(null);
  const [cards, setCards] = useState<PracticeCard[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("asking");
  const [attempt, setAttempt] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [stats, setStats] = useState({ correct: 0, wrong: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!signedIn) return;
    setLoading(true);
    setError(null);
    try {
      const res = await queueFn({ data: { color, limit: 12, includeNew: true } });
      setCards(res.cards);
      setIndex(0);
      setPhase("asking");
      setAttempt(null);
      setStartedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "queue_failed");
    } finally {
      setLoading(false);
    }
  }, [color, queueFn, signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  const card = cards[index] ?? null;
  const orientation: "w" | "b" = card?.color === "black" ? "b" : "w";

  // Nine64 plays the opponent moves; the board shows the position right before
  // the user's repertoire reply.
  const setupSans = useMemo(() => card?.setup ?? [], [card]);
  const shownSans = useMemo(() => {
    if (!card) return [];
    if (phase === "asking") return setupSans;
    return attempt && phase === "wrong" ? [...setupSans, attempt] : [...setupSans, card.expectedSan];
  }, [attempt, card, phase, setupSans]);

  const answer = async (san: string) => {
    if (!card || phase !== "asking") return;
    const correct = san === card.expectedSan;
    setAttempt(san);
    setPhase(correct ? "correct" : "wrong");
    setStats((s) => ({ correct: s.correct + (correct ? 1 : 0), wrong: s.wrong + (correct ? 0 : 1) }));
    try {
      await gradeFn({
        data: { cardId: card.id, correct, slow: Date.now() - startedAt > SLOW_MS },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "grade_failed");
    }
  };

  const next = () => {
    setPhase("asking");
    setAttempt(null);
    setStartedAt(Date.now());
    setIndex((i) => i + 1);
  };

  const onPush = (san: string) => {
    void answer(san);
  };

  const legalAfterSetup = useMemo(() => {
    const chess = new Chess();
    for (const san of setupSans) {
      try {
        chess.move(san);
      } catch {
        break;
      }
    }
    return chess.moves();
  }, [setupSans]);

  if (!signedIn) {
    return <p className="panel p-6 text-sm text-muted-foreground">{t("lab.signInHint")}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={color === null ? "default" : "outline"} onClick={() => setColor(null)}>
          {t("lab.practice.all")}
        </Button>
        {(["white", "black"] as RepertoireColor[]).map((c) => (
          <Button key={c} size="sm" variant={color === c ? "default" : "outline"} onClick={() => setColor(c)}>
            {t(c === "white" ? "lab.white" : "lab.black")}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="size-4" /> {t("lab.practice.reload")}
        </Button>
        <span className="font-mono text-2xs text-muted-foreground">
          {t("lab.practice.session", { correct: stats.correct, wrong: stats.wrong })}
        </span>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {!card ? (
        <div className="panel p-6 text-center">
          <Brain className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            {cards.length === 0 && !loading ? t("lab.practice.empty") : t("lab.practice.done")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="mx-auto w-full max-w-[520px]">
            <OpeningBoard
              sans={shownSans}
              orientation={orientation}
              onPush={onPush}
              interactive={phase === "asking"}
            />
            <p className="mt-2 font-mono text-2xs text-muted-foreground break-words">
              {pathLabel(setupSans) || t("study.openings.startPosition")}
            </p>
          </div>

          <GamePanel
            title={t("lab.practice.recall")}
            meta={
              <span className="text-2xs text-muted-foreground">
                {card.eco ? `${card.eco} · ` : ""}
                {card.openingName ?? ""}
              </span>
            }
            bodyClassName="p-3 space-y-3"
          >
            {phase === "asking" ? (
              <>
                <p className="text-sm">{t("lab.practice.prompt")}</p>
                <div className="flex flex-wrap gap-1">
                  {legalAfterSetup.slice(0, 40).map((san) => (
                    <Button key={san} size="sm" variant="outline" className="h-7 px-2 font-mono text-2xs" onClick={() => void answer(san)}>
                      {san}
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className={phase === "correct" ? "text-sm font-semibold text-primary" : "text-sm font-semibold text-destructive"}>
                  {phase === "correct" ? (
                    <>
                      <Check className="mr-1 inline size-4" />
                      {t("lab.practice.correct", { san: card.expectedSan })}
                    </>
                  ) : (
                    <>
                      <X className="mr-1 inline size-4" />
                      {t("lab.practice.wrong", { played: attempt ?? "?", expected: card.expectedSan })}
                    </>
                  )}
                </p>
                {card.notes ? <p className="text-xs text-muted-foreground">{card.notes}</p> : null}
                {phase === "wrong" ? (
                  <p className="text-xs text-muted-foreground">{t("lab.practice.scheduled")}</p>
                ) : null}
                <Button size="sm" onClick={next}>
                  {t("lab.practice.next")}
                </Button>
              </>
            )}
          </GamePanel>
        </div>
      )}
    </div>
  );
}
