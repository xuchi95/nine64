import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Check, Eye, EyeOff, Lightbulb, Timer, Heart, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { useT } from "@/lib/i18n";
import type { Color } from "@/hooks/useChessGame";
import {
  finishPuzzleSession,
  getPuzzleOverview,
  getPuzzleQueue,
  startPuzzleSession,
  submitPuzzleAttempt,
} from "@/lib/puzzles.functions";
import { MODE_RULES, PUZZLE_MODES, SPRINT_DURATIONS, sprintPoints, type PuzzleMode } from "@/lib/puzzles/modes";
import { THEME_KEYS, type ThemeKey } from "@/lib/puzzles/themes";
import { HINT_KIND_BY_LEVEL, hintFor, type HintLevel } from "@/lib/puzzles/hints";
import { attemptMove, initialSolverState, type SolverState } from "@/lib/learn/puzzleSolver";
import type { PlatformPuzzle } from "@/lib/puzzles/types";

export const Route = createFileRoute("/_authenticated/puzzles/train")({
  head: () =>
    pageHead({
      path: "/puzzles/train",
      title: `Trung tâm câu đố — ${APP.name}`,
      description:
        "Chín chế độ luyện chiến thuật: thích ứng, lỗi cá nhân, tính điểm, chủ đề, khai cuộc, tàn cuộc, sprint, sinh tồn và tính toán mù.",
    }),
  component: PuzzleTrainer,
});

type QueueItem = PlatformPuzzle & { reasons: string[]; due: string | null };

interface RunState {
  mode: PuzzleMode;
  sessionId: string | null;
  score: number;
  solved: number;
  failed: number;
  lives: number | null;
  endsAt: number | null;
  hints: number;
  streak: number;
}

function PuzzleTrainer() {
  const { t } = useT();
  const queueFn = useServerFn(getPuzzleQueue);
  const overviewFn = useServerFn(getPuzzleOverview);
  const submitFn = useServerFn(submitPuzzleAttempt);
  const startFn = useServerFn(startPuzzleSession);
  const finishFn = useServerFn(finishPuzzleSession);

  const [mode, setMode] = useState<PuzzleMode>("adaptive");
  const [theme, setTheme] = useState<ThemeKey>("fork");
  const [duration, setDuration] = useState<number>(SPRINT_DURATIONS[0]);
  const [run, setRun] = useState<RunState | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [solver, setSolver] = useState<SolverState | null>(null);
  const [hintLevel, setHintLevel] = useState<0 | HintLevel>(0);
  const [wrongMoves, setWrongMoves] = useState(0);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [feedback, setFeedback] = useState<{ kind: "solved" | "failed"; text: string } | null>(null);
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getPuzzleOverview>> | null>(null);
  const [blindHidden, setBlindHidden] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const runRef = useRef<RunState | null>(null);
  runRef.current = run;

  const puzzle = queue[index] ?? null;

  useEffect(() => {
    void overviewFn().then(setOverview).catch(() => undefined);
  }, [overviewFn]);

  useEffect(() => {
    if (!run?.endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [run?.endsAt]);

  const position = useMemo(() => {
    if (!solver) return null;
    try {
      return new Chess(solver.fen);
    } catch {
      return null;
    }
  }, [solver]);

  const pieces = useMemo(() => {
    if (!position || (blindHidden && MODE_RULES[mode].blind)) return [];
    return position
      .board()
      .flat()
      .filter((sq): sq is NonNullable<typeof sq> => sq !== null)
      .map((sq) => ({ square: sq.square as string, type: sq.type, color: sq.color }));
  }, [position, blindHidden, mode]);

  const loadQueue = useCallback(
    async (currentRun: RunState | null) => {
      setLoading(true);
      try {
        const res = await queueFn({
          data: {
            mode: currentRun?.mode ?? mode,
            themes: (currentRun?.mode ?? mode) === "theme" ? [theme] : [],
            limit: 8,
            solvedInRun: currentRun?.solved ?? 0,
          },
        });
        setQueue(res.puzzles as QueueItem[]);
        setIndex(0);
        setSolver(res.puzzles[0] ? initialSolverState(res.puzzles[0] as QueueItem) : null);
        setHintLevel(0);
        setWrongMoves(0);
        setFeedback(null);
        setStartedAt(Date.now());
      } finally {
        setLoading(false);
      }
    },
    [mode, queueFn, theme],
  );

  const startRun = async () => {
    const rules = MODE_RULES[mode];
    let sessionId: string | null = null;
    if (mode === "sprint" || mode === "survival") {
      const res = await startFn({
        data: {
          mode,
          durationSeconds: mode === "sprint" ? duration : null,
          lives: mode === "survival" ? (rules.lives ?? 3) : null,
        },
      });
      sessionId = res.sessionId;
    }
    const next: RunState = {
      mode,
      sessionId,
      score: 0,
      solved: 0,
      failed: 0,
      lives: mode === "survival" ? (rules.lives ?? 3) : null,
      endsAt: mode === "sprint" ? Date.now() + duration * 1000 : null,
      hints: 0,
      streak: 0,
    };
    setRun(next);
    setBlindHidden(MODE_RULES[mode].blind ?? false);
    await loadQueue(next);
  };

  const endRun = useCallback(async () => {
    const current = runRef.current;
    setRun(null);
    setQueue([]);
    setSolver(null);
    if (current?.sessionId) {
      await finishFn({
        data: {
          sessionId: current.sessionId,
          score: current.score,
          solved: current.solved,
          failed: current.failed,
          hintsUsed: current.hints,
        },
      }).catch(() => undefined);
    }
    setFeedback(
      current
        ? {
            kind: "solved",
            text: t("pz.runSummary", {
              solved: current.solved,
              failed: current.failed,
              score: current.score,
            }),
          }
        : null,
    );
    void overviewFn().then(setOverview).catch(() => undefined);
  }, [finishFn, overviewFn, t]);

  // Sprint clock.
  useEffect(() => {
    if (run?.endsAt && now >= run.endsAt) void endRun();
  }, [run?.endsAt, now, endRun]);

  const advance = async () => {
    const current = runRef.current;
    if (index + 1 < queue.length) {
      const nextPuzzle = queue[index + 1]!;
      setIndex(index + 1);
      setSolver(initialSolverState(nextPuzzle));
    } else {
      await loadQueue(current);
    }
    setHintLevel(0);
    setWrongMoves(0);
    setFeedback(null);
    setStartedAt(Date.now());
    setBlindHidden(MODE_RULES[current?.mode ?? mode].blind ?? false);
  };

  const report = async (solved: boolean, hints: number, wrong: number) => {
    if (!puzzle) return;
    const seconds = (Date.now() - startedAt) / 1000;
    const res = await submitFn({
      data: {
        puzzleId: puzzle.id,
        source: puzzle.source,
        mode: run?.mode ?? mode,
        sessionId: run?.sessionId ?? null,
        solved,
        hintsUsed: hints,
        wrongMoves: wrong,
        seconds,
        movesPlayed: [],
      },
    }).catch(() => null);

    setRun((prev) => {
      if (!prev) return prev;
      const streak = solved ? prev.streak + 1 : 0;
      const lives = prev.lives === null ? null : solved ? prev.lives : prev.lives - 1;
      const next: RunState = {
        ...prev,
        streak,
        lives,
        hints: prev.hints + hints,
        solved: prev.solved + (solved ? 1 : 0),
        failed: prev.failed + (solved ? 0 : 1),
        score: prev.score + (solved ? sprintPoints(puzzle.rating, streak) : 0),
      };
      return next;
    });

    setFeedback({
      kind: solved ? "solved" : "failed",
      text: solved
        ? `${t("pz.solved")} · ${t("pz.learningScore")} ${res?.learningScore ?? 0}${
            res?.rated ? ` · ${res.rating.delta >= 0 ? "+" : ""}${res.rating.delta}` : ""
          }`
        : `${t("pz.failed")} · ${puzzle.solution[0]?.san ?? ""}`,
    });
    if (res) void overviewFn().then(setOverview).catch(() => undefined);
  };

  const onMove = (from: string, to: string, promotion?: "q" | "r" | "b" | "n"): boolean => {
    if (!puzzle || !solver || feedback) return false;
    const result = attemptMove(puzzle, solver, from, to, promotion);
    if (result.playedSan === null && result.status === solver.status) return false;
    setSolver({
      fen: result.fen,
      playedPlies: result.playedPlies,
      status: result.status,
      lastMove: result.lastMove,
    });
    if (result.status === "wrong") {
      setWrongMoves((w) => w + 1);
      void report(false, hintLevel, wrongMoves + 1);
    } else if (result.status === "solved") {
      void report(true, hintLevel, wrongMoves);
    }
    return true;
  };

  const currentHint =
    puzzle && solver && hintLevel > 0
      ? hintFor(puzzle, solver.fen, solver.playedPlies, hintLevel as HintLevel)
      : null;

  const secondsLeft = run?.endsAt ? Math.max(0, Math.ceil((run.endsAt - now) / 1000)) : null;
  const outOfLives = run?.lives !== null && run?.lives !== undefined && run.lives <= 0;
  useEffect(() => {
    if (outOfLives) void endRun();
  }, [outOfLives, endRun]);

  return (
    <AppShell wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("pz.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("pz.subtitle")}</p>
        </div>
        {run ? (
          <Button variant="outline" onClick={() => void endRun()}>
            {t("pz.stop")}
          </Button>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-4">
        <Stat label={t("pz.rating")} value={String(overview?.rating.rating ?? "—")} />
        <Stat label={t("pz.streak")} value={String(overview?.stats.currentStreak ?? 0)} />
        <Stat label={t("pz.due")} value={String(overview?.dueCount ?? 0)} />
        <Stat label={t("pz.catalog")} value={String(overview?.catalogCount ?? 0)} />
      </div>

      {!run ? (
        <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PUZZLE_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`panel p-4 text-left transition ${mode === m ? "ring-2 ring-primary" : "hover:bg-secondary/40"}`}
              >
                <div className="font-semibold">{t(`pz.mode.${m}`)}</div>
                <p className="mt-1 text-xs text-muted-foreground">{t(`pz.mode.${m}.desc`)}</p>
              </button>
            ))}
          </div>

          {mode === "theme" ? (
            <div className="panel p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("pz.chooseTheme")}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {THEME_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTheme(key)}
                    className={`rounded px-2 py-1 text-xs ${theme === key ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                  >
                    {key.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {mode === "sprint" ? (
            <div className="panel p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("pz.duration")}
              </div>
              <div className="mt-2 flex gap-2">
                {SPRINT_DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={`rounded px-3 py-1 text-sm ${duration === d ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                  >
                    {t("pz.minutes", { n: d / 60 })}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {feedback ? (
            <div className="panel p-4 text-sm">
              <span className="font-medium">{t("pz.runOver")}:</span> {feedback.text}
            </div>
          ) : null}

          <Button onClick={() => void startRun()} disabled={loading}>
            {t("pz.start")}
          </Button>
        </div>
      ) : !puzzle || !position ? (
        <div className="panel mt-6 p-6 text-center text-sm text-muted-foreground">{t("pz.empty")}</div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <ChessBoard
              pieces={pieces}
              orientation={puzzle.color as Color}
              turn={position.turn() as Color}
              legalTargets={(square) =>
                feedback
                  ? []
                  : position.moves({ square: square as never, verbose: true }).map((m) => m.to as string)
              }
              canMoveFrom={(square) => {
                if (feedback) return false;
                const piece = position.get(square as never);
                return !!piece && piece.color === position.turn();
              }}
              onMove={onMove}
              needsPromotion={(from, to) => {
                const piece = position.get(from as never);
                if (!piece || piece.type !== "p") return false;
                return to.endsWith(piece.color === "w" ? "8" : "1");
              }}
              lastMove={solver?.lastMove ?? null}
              checkSquare={null}
              interactive={!feedback}
            />
          </div>

          <aside className="space-y-4">
            <div className="panel p-4">
              <div className="flex items-center justify-between text-sm">
                <span>{puzzle.color === "w" ? t("pz.toMoveW") : t("pz.toMoveB")}</span>
                <span className="font-mono">{puzzle.rating}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {puzzle.themes.map((m) => (
                  <span key={m} className="rounded bg-secondary px-2 py-0.5 text-2xs">
                    {m.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {run.endsAt ? (
                  <span className="inline-flex items-center gap-1">
                    <Timer className="size-3.5" /> {t("pz.timeLeft")} {secondsLeft}s
                  </span>
                ) : null}
                {run.lives !== null ? (
                  <span className="inline-flex items-center gap-1">
                    <Heart className="size-3.5" /> {t("pz.lives")} {run.lives}
                  </span>
                ) : null}
                <span>
                  {t("pz.score")} {run.score}
                </span>
              </div>
            </div>

            <div className="panel p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("pz.why")}</div>
              <ul className="mt-2 space-y-1 text-sm">
                {puzzle.reasons.map((r) => (
                  <li key={r}>· {t(`pz.reason.${r}`)}</li>
                ))}
              </ul>
            </div>

            <div className="panel space-y-2 p-4">
              {feedback ? (
                <>
                  <div
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                      feedback.kind === "solved"
                        ? "bg-primary/15 text-primary"
                        : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {feedback.kind === "solved" ? <Check className="size-4" /> : <X className="size-4" />}
                    {feedback.text}
                  </div>
                  <Button className="w-full" onClick={() => void advance()}>
                    {t("pz.next")}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={hintLevel >= 5}
                    onClick={() => setHintLevel((l) => (Math.min(5, l + 1) as HintLevel))}
                  >
                    <Lightbulb className="size-4" />{" "}
                    {hintLevel === 0 ? t("pz.hint") : t("pz.hintLevel", { n: hintLevel })}
                  </Button>
                  {currentHint ? (
                    <p className="rounded bg-secondary/60 px-3 py-2 text-sm">
                      {t(`pz.hint.${HINT_KIND_BY_LEVEL[currentHint.level]}`, {
                        value: currentHint.value.replace(/_/g, " "),
                      })}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("pz.hintCost")}</p>
                  )}
                  {MODE_RULES[run.mode].blind ? (
                    <Button variant="ghost" className="w-full" onClick={() => setBlindHidden((b) => !b)}>
                      {blindHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                      {blindHidden ? t("pz.blindReveal") : t("pz.blindHide")}
                    </Button>
                  ) : null}
                  {solver && solver.playedPlies > 0 && solver.status === "progress" ? (
                    <p className="text-xs text-muted-foreground">{t("pz.progress")}</p>
                  ) : null}
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl">{value}</div>
    </div>
  );
}
