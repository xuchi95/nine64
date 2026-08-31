import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, RotateCcw, CheckCircle2, XCircle, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LessonBoard } from "./LessonBoard";
import { TablebasePanel } from "./TablebasePanel";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  localized,
  isInteractive,
  type LessonRecord,
  type LessonStep,
  type LocaleKey,
  type QuizOption,
} from "@/lib/learn/lessonTypes";
import {
  applySan,
  checkAnswer,
  gradeFor,
  resolveToken,
  scoreAttempt,
  type StepOutcome,
} from "@/lib/learn/lessonEngine";
import { recordAttempt } from "@/lib/learn/learn.functions";
import { StockfishEngine } from "@/lib/engine/stockfish";

/** Local piece count — the tablebase module is server-only. */
function pieceCount(fen: string): number {
  return (fen.split(" ")[0] ?? "").replace(/[^a-zA-Z]/g, "").length;
}

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type Status = "idle" | "correct" | "alternate" | "wrong";

interface Props {
  lesson: LessonRecord;
  /** Called after the attempt is saved (or skipped when signed out). */
  onFinished?: (score: number) => void;
  nextLessonSlug?: string | null;
  onOpenNext?: () => void;
}

export function LessonPlayer({ lesson, onFinished, onOpenNext, nextLessonSlug }: Props) {
  const { t, locale } = useT();
  const { user } = useAuth();
  const steps = lesson.doc.steps;
  const save = useServerFn(recordAttempt);

  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<string, StepOutcome>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [solved, setSolved] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [lineFen, setLineFen] = useState<string | null>(null);
  const [linePly, setLinePly] = useState(0);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [engineThinking, setEngineThinking] = useState(false);
  const [finished, setFinished] = useState<{ score: number; saved: boolean } | null>(null);
  const engineRef = useRef<StockfishEngine | null>(null);

  const step: LessonStep | undefined = steps[index];
  const baseFen = step?.fen && step.fen.trim() ? step.fen : START_FEN;
  const fen = lineFen ?? baseFen;

  useEffect(() => {
    setStatus("idle");
    setSolved(false);
    setHintShown(false);
    setRevealed(false);
    setLineFen(null);
    setLinePly(0);
    setLastMove(null);
    setEngineThinking(false);
  }, [index]);

  useEffect(
    () => () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    },
    [],
  );

  const bump = useCallback(
    (stepId: string, patch: Partial<StepOutcome>) => {
      setOutcomes((prev) => {
        const current = prev[stepId] ?? { stepId, wrong: 0, hintUsed: false };
        return { ...prev, [stepId]: { ...current, ...patch } };
      });
    },
    [],
  );

  const registerWrong = useCallback(
    (stepId: string) => {
      setOutcomes((prev) => {
        const current = prev[stepId] ?? { stepId, wrong: 0, hintUsed: false };
        return { ...prev, [stepId]: { ...current, wrong: current.wrong + 1 } };
      });
    },
    [],
  );

  /** Opponent reply in a play_continuation line. */
  const advanceLine = useCallback(
    (currentStep: LessonStep, fenAfterUser: string, plyAfterUser: number) => {
      const line = currentStep.line;
      if (plyAfterUser >= line.length) {
        setSolved(true);
        setLineFen(fenAfterUser);
        setLinePly(plyAfterUser);
        return;
      }
      const replySan = line[plyAfterUser]!;
      const resolved = resolveToken(fenAfterUser, replySan);
      const next = resolved ? applySan(fenAfterUser, resolved.san) : null;
      if (!next) {
        setSolved(true);
        setLineFen(fenAfterUser);
        return;
      }
      setLineFen(next);
      setLinePly(plyAfterUser + 1);
      if (plyAfterUser + 1 >= line.length) setSolved(true);
    },
    [],
  );

  const engineReply = useCallback(async (currentStep: LessonStep, fenNow: string) => {
    setEngineThinking(true);
    try {
      if (!engineRef.current) engineRef.current = new StockfishEngine("performance");
      const skill = Math.max(0, Math.min(20, (currentStep.engineLevel ?? 8) + 2));
      const lines = await engineRef.current.search({ fen: fenNow, skill, moveTimeMs: 400 });
      const best = lines[0]?.move;
      if (!best) return;
      const chess = new Chess(fenNow);
      const move = chess.move({
        from: best.slice(0, 2),
        to: best.slice(2, 4),
        promotion: (best[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
      });
      if (!move) return;
      setLineFen(chess.fen());
      setLastMove({ from: move.from, to: move.to });
      if (chess.isGameOver()) evaluateEngineEnd(currentStep, chess);
    } catch {
      /* engine unavailable — the learner can still finish manually */
    } finally {
      setEngineThinking(false);
    }
  }, []);

  const evaluateEngineEnd = useCallback(
    (currentStep: LessonStep, chess: Chess) => {
      const userIsWhite = (currentStep.userColor ?? "white") === "white";
      const wanted = currentStep.success?.results ?? ["win"];
      let result: "win" | "draw" | "loss" = "draw";
      if (chess.isCheckmate()) {
        const loserIsWhite = chess.turn() === "w";
        result = loserIsWhite === userIsWhite ? "loss" : "win";
      } else if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition()) {
        result = "draw";
      }
      if (result !== "loss" && wanted.includes(result as "win" | "draw")) {
        setStatus("correct");
        setSolved(true);
      } else {
        setStatus("wrong");
        registerWrong(currentStep.id);
      }
    },
    [registerWrong],
  );

  const handleMove = useCallback(
    (move: { from: string; to: string; promotion?: "q" | "r" | "b" | "n" }): boolean => {
      if (!step || solved) return false;

      if (step.type === "play_continuation") {
        const expectedSan = step.line[linePly];
        if (!expectedSan) return false;
        const result = checkAnswer(step, fen, move, [expectedSan]);
        if (result.status === "wrong") {
          setStatus("wrong");
          registerWrong(step.id);
          return false;
        }
        setStatus("correct");
        setLastMove({ from: move.from, to: move.to });
        advanceLine(step, result.fen, linePly + 1);
        return true;
      }

      if (step.type === "engine_challenge") {
        const chess = new Chess(fen);
        let played;
        try {
          played = chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? "q" });
        } catch {
          return false;
        }
        if (!played) return false;
        setLineFen(chess.fen());
        setLastMove({ from: played.from, to: played.to });
        setStatus("idle");
        if (chess.isGameOver()) {
          evaluateEngineEnd(step, chess);
        } else {
          void engineReply(step, chess.fen());
        }
        return true;
      }

      const result = checkAnswer(step, fen, move);
      setLastMove({ from: move.from, to: move.to });
      if (result.status === "wrong") {
        setStatus("wrong");
        registerWrong(step.id);
        return false;
      }
      setStatus(result.status);
      setSolved(true);
      setLineFen(result.fen);
      return true;
    },
    [advanceLine, engineReply, evaluateEngineEnd, fen, linePly, registerWrong, solved, step],
  );

  const answerQuiz = useCallback(
    (questionId: string, optionId: string, correct: boolean, singleQuestion: boolean) => {
      if (!step) return;
      setChoice((prev) => ({ ...prev, [`${step.id}:${questionId}`]: optionId }));
      if (!correct) {
        setStatus("wrong");
        registerWrong(step.id);
        return;
      }
      setStatus("correct");
      if (singleQuestion) setSolved(true);
      else {
        const answered = step.questions.every(
          (q) =>
            q.id === questionId ||
            q.options.some((o) => o.correct && choice[`${step.id}:${q.id}`] === o.id),
        );
        if (answered) setSolved(true);
      }
    },
    [choice, registerWrong, step],
  );

  const canContinue = !step || !isInteractive(step) || solved || revealed;

  const finish = useCallback(async () => {
    const list = steps.filter(isInteractive).map(
      (s) => outcomes[s.id] ?? { stepId: s.id, wrong: 0, hintUsed: false },
    );
    const score = scoreAttempt(list);
    let saved = false;
    if (user) {
      try {
        await save({
          data: {
            lessonId: lesson.id,
            score,
            completed: true,
            steps: list.map((o) => ({ stepId: o.stepId, grade: gradeFor(o) })),
          },
        });
        saved = true;
      } catch {
        saved = false;
      }
    }
    setFinished({ score, saved });
    onFinished?.(score);
  }, [lesson.id, onFinished, outcomes, save, steps, user]);

  const restart = useCallback(() => {
    setFinished(null);
    setOutcomes({});
    setIndex(0);
    setChoice({});
  }, []);

  const solutionSan = useMemo(() => {
    if (!step) return "";
    const token = step.type === "play_continuation" ? step.line[linePly] : step.expectedMoves[0];
    if (!token) return "";
    return resolveToken(fen, token)?.san ?? token;
  }, [fen, linePly, step]);

  const showTablebase =
    Boolean(step) &&
    (step!.type === "engine_challenge" || step!.type === "play_continuation" || step!.type === "board") &&
    pieceCount(fen) <= 7;

  if (finished) {
    return (
      <section className="rounded-xl border border-border/70 bg-card/60 p-6 text-center">
        <Trophy className="mx-auto size-8 text-primary" />
        <h2 className="mt-3 text-lg font-semibold">{t("academy.summary.title")}</h2>
        <p className="mt-1 font-mono text-2xl">{t("academy.summary.score", { score: finished.score })}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {finished.saved ? t("academy.summary.saved") : t("academy.summary.notSaved")}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={restart}>
            <RotateCcw className="mr-1.5 size-4" />
            {t("academy.summary.again")}
          </Button>
          {nextLessonSlug ? (
            <Button onClick={onOpenNext}>{t("academy.summary.nextLesson")}</Button>
          ) : null}
        </div>
      </section>
    );
  }

  if (!step) return <p className="text-sm text-muted-foreground">{t("academy.empty")}</p>;

  const promptKey: Record<string, string> = {
    find_move: "academy.step.findMove",
    drag_piece: "academy.step.dragPiece",
    play_continuation: "academy.step.playLine",
    engine_challenge: "academy.step.engine",
    multiple_choice: "academy.step.quiz",
    checkpoint_quiz: "academy.step.quiz",
  };
  const boardStep = step.type !== "text";
  const interactive =
    !solved &&
    (step.type === "find_move" ||
      step.type === "drag_piece" ||
      step.type === "play_continuation" ||
      step.type === "engine_challenge") &&
    !engineThinking;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("academy.step.of", { index: index + 1, total: steps.length })}
        </p>
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${((index + (solved ? 1 : 0)) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      <div className={cn("grid gap-5", boardStep ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : "")}>
        {boardStep ? (
          <div className="min-w-0">
            <LessonBoard
              fen={fen}
              orientation={step.orientation ?? "white"}
              highlights={step.highlights}
              arrows={step.arrows}
              interactive={interactive}
              lastMove={lastMove}
              onMove={handleMove}
            />
          </div>
        ) : null}

        <div className="space-y-3">
          {step.title ? (
            <h2 className="text-lg font-semibold">{localized(step.title, locale)}</h2>
          ) : null}
          {step.body ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {localized(step.body, locale)}
            </p>
          ) : null}
          {promptKey[step.type] ? (
            <p className="text-sm font-medium">{t(promptKey[step.type]!)}</p>
          ) : null}

          {step.type === "multiple_choice" ? (
            <ul className="space-y-2">
              {step.options.map((option) => (
                <QuizOptionButton
                  key={option.id}
                  option={option}
                  locale={locale}
                  picked={choice[`${step.id}:q1`] === option.id}
                  onPick={() => answerQuiz("q1", option.id, option.correct, true)}
                />
              ))}
            </ul>
          ) : null}

          {step.type === "checkpoint_quiz" ? (
            <div className="space-y-4">
              {step.questions.map((question) => (
                <div key={question.id} className="space-y-2">
                  <p className="text-sm font-medium">{localized(question.prompt, locale)}</p>
                  <ul className="space-y-2">
                    {question.options.map((option) => (
                      <QuizOptionButton
                        key={option.id}
                        option={option}
                        locale={locale}
                        picked={choice[`${step.id}:${question.id}`] === option.id}
                        onPick={() => answerQuiz(question.id, option.id, option.correct, false)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}

          {status !== "idle" ? (
            <p
              className={cn(
                "flex items-center gap-1.5 text-sm font-medium",
                status === "correct" && "text-emerald-400",
                status === "alternate" && "text-amber-300",
                status === "wrong" && "text-destructive",
              )}
            >
              {status === "wrong" ? <XCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
              {status === "correct"
                ? t("academy.step.correct")
                : status === "alternate"
                  ? t("academy.step.alternate")
                  : t("academy.step.wrong")}
            </p>
          ) : null}

          {solved && step.explanation ? (
            <p className="rounded-lg border border-border/60 bg-background/60 p-3 text-sm text-muted-foreground">
              {localized(step.explanation, locale)}
            </p>
          ) : null}

          {hintShown && step.hint ? (
            <p className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
              {localized(step.hint, locale)}
            </p>
          ) : null}

          {revealed && solutionSan ? (
            <p className="font-mono text-sm">{t("academy.step.solution", { san: solutionSan })}</p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            {step.hint && !hintShown && !solved ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setHintShown(true);
                  bump(step.id, { hintUsed: true });
                }}
              >
                <Lightbulb className="mr-1.5 size-4" />
                {t("academy.step.showHint")}
              </Button>
            ) : null}
            {isInteractive(step) && !solved && solutionSan ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRevealed(true);
                  registerWrong(step.id);
                }}
              >
                {t("academy.step.showSolution")}
              </Button>
            ) : null}
            {index > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setIndex((i) => i - 1)}>
                {t("academy.step.prev")}
              </Button>
            ) : null}
            {index < steps.length - 1 ? (
              <Button size="sm" disabled={!canContinue} onClick={() => setIndex((i) => i + 1)}>
                {t("academy.step.next")}
              </Button>
            ) : (
              <Button size="sm" disabled={!canContinue} onClick={() => void finish()}>
                {t("academy.step.finish")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {showTablebase ? <TablebasePanel fen={fen} /> : null}
    </div>
  );
}

function QuizOptionButton({
  option,
  locale,
  picked,
  onPick,
}: {
  option: QuizOption;
  locale: LocaleKey;
  picked: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={cn(
          "w-full rounded-lg border px-3 py-2 text-left text-sm transition",
          picked && option.correct && "border-emerald-500/60 bg-emerald-500/10",
          picked && !option.correct && "border-destructive/60 bg-destructive/10",
          !picked && "border-border/70 hover:border-primary/60 hover:bg-primary/5",
        )}
      >
        {localized(option.text, locale)}
        {picked && option.feedback ? (
          <span className="mt-1 block text-xs text-muted-foreground">
            {localized(option.feedback, locale)}
          </span>
        ) : null}
      </button>
    </li>
  );
}
