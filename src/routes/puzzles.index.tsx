import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Check, Lightbulb, RotateCcw, Sparkles, Target, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { useT } from "@/lib/i18n";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import type { Color } from "@/hooks/useChessGame";
import { useGameHistory } from "@/lib/history";
import { MOTIF_LABEL } from "@/lib/analysis/motifs";
import { formatRating, isProvisional } from "@/lib/rating/glicko2";
import { addPuzzles, gradePuzzle, hydrateLearn, useLearnState } from "@/lib/learn/store";
import { generateFromLibrary, type Puzzle } from "@/lib/learn/puzzleGen";
import { attemptMove, initialSolverState, solverPlyCount, type SolverState } from "@/lib/learn/puzzleSolver";
import { isDue, retrievability, sortByUrgency } from "@/lib/learn/fsrs";
import { BoardSkeleton } from "@/components/layout/PageSkeleton";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/puzzles/")({
  head: () =>
    pageHead({
      path: "/puzzles",
      title: `Câu đố từ ván của bạn — ${APP.name}`,
      description:
        "Luyện chiến thuật theo lặp lại ngắt quãng, sinh ra từ đúng những thế cờ bạn đã đi sai, chấm điểm bằng Glicko-2.",
    }),
  pendingComponent: BoardSkeleton,
  component: PuzzlesPage,
});

type Verdict = "idle" | "correct" | "wrong";

function PuzzlesPage() {
  const { t } = useT();
  const games = useGameHistory();
  const learn = useLearnState();
  const [index, setIndex] = useState(0);
  const [hinted, setHinted] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [solver, setSolver] = useState<SolverState | null>(null);

  useEffect(() => {
    hydrateLearn();
  }, []);

  const queue = useMemo(() => {
    const due = learn.puzzles.filter((p) => isDue(p.srs));
    const pool = due.length > 0 ? due : learn.puzzles;
    return sortByUrgency(pool);
  }, [learn.puzzles]);

  const puzzle: Puzzle | null = queue[Math.min(index, Math.max(0, queue.length - 1))] ?? null;

  useEffect(() => {
    setSolver(puzzle ? initialSolverState(puzzle) : null);
    setHinted(false);
    setStartedAt(Date.now());
  }, [puzzle?.id]);

  const verdict: Verdict =
    solver?.status === "solved" ? "correct" : solver?.status === "wrong" ? "wrong" : "idle";
  const finished = verdict !== "idle";

  const position = useMemo(() => {
    const fen = solver?.fen ?? puzzle?.fen;
    if (!fen) return null;
    const chess = new Chess();
    try {
      chess.load(fen);
    } catch {
      return null;
    }
    return chess;
  }, [solver?.fen, puzzle?.fen]);

  const pieces = useMemo(() => {
    if (!position) return [];
    return position
      .board()
      .flat()
      .filter((sq): sq is NonNullable<typeof sq> => sq !== null)
      .map((sq) => ({ square: sq.square as string, type: sq.type, color: sq.color }));
  }, [position]);

  const reviewedCount = games.filter((g) => (g.review?.plies?.length ?? 0) > 0).length;

  const generate = () => {
    const created = addPuzzles(generateFromLibrary(games));
    if (created === 0) {
      toast.info(t("study.puzzles.noNewTitle"), {
        description:
          reviewedCount === 0
            ? t("study.puzzles.noNewNeedsReview")
            : t("study.puzzles.noNewAllUsed"),
      });
      return;
    }
    toast.success(t("study.puzzles.createdCount", { n: created }), {
      description: t("study.puzzles.createdDesc"),
    });
  };

  const submit = (from: string, to: string, promotion?: "q" | "r" | "b" | "n"): boolean => {
    if (!puzzle || !solver || finished) return false;
    const result = attemptMove(puzzle, solver, from, to, promotion);
    // Illegal drop: nothing consumed, no penalty.
    if (result.playedSan === null && result.status === solver.status) return false;
    setSolver({
      fen: result.fen,
      playedPlies: result.playedPlies,
      status: result.status,
      lastMove: result.lastMove,
    });

    if (result.status === "wrong") {
      gradePuzzle(puzzle.id, 1);
      toast.error(t("study.puzzles.wrong"), {
        description: result.expected?.san
          ? t("study.puzzles.theWinWas", { san: result.expected.san })
          : undefined,
      });
      return true;
    }

    if (result.status === "solved") {
      const seconds = (Date.now() - startedAt) / 1000;
      const grade = hinted ? 2 : seconds < 12 * solverPlyCount(puzzle) ? 4 : 3;
      gradePuzzle(puzzle.id, grade);
      toast.success(hinted ? t("study.puzzles.correctHint") : t("study.puzzles.correct"), {
        description: puzzle.solutionSan
          ? t("study.puzzles.bestMove", { san: puzzle.solutionSan })
          : undefined,
      });
    }
    return true;
  };

  const next = () => {
    setIndex((i) => (queue.length === 0 ? 0 : (i + 1) % queue.length));
  };

  const solvedTotal = learn.puzzles.reduce((a, p) => a + p.solved, 0);
  const attemptTotal = learn.puzzles.reduce((a, p) => a + p.attempts, 0);
  const dueCount = learn.puzzles.filter((p) => isDue(p.srs)).length;

  return (
    <AppShell wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("study.puzzles.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("study.puzzles.subtitle")}
          </p>
        </div>
        <Button onClick={generate}>
          <Sparkles className="size-4" /> {t("study.puzzles.generate")}
        </Button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-4">
        <Stat label={t("study.puzzles.statRating")} value={formatRating(learn.rating.rating, learn.rating.rd)} note={isProvisional(learn.rating.rd) ? t("study.puzzles.provisional") : t("study.puzzles.established")} />
        <Stat label={t("study.puzzles.statDeck")} value={String(learn.puzzles.length)} note={t("study.puzzles.dueNow", { n: dueCount })} />
        <Stat label={t("study.puzzles.statSolved")} value={String(solvedTotal)} note={t("study.puzzles.attempts", { n: attemptTotal })} />
        <Stat
          label={t("study.puzzles.statSuccessRate")}
          value={attemptTotal === 0 ? "—" : `${Math.round((solvedTotal / attemptTotal) * 100)}%`}
          note={t("study.puzzles.allTime")}
        />
      </div>

      {!puzzle || !position ? (
        <div className="panel mt-6 p-6 text-center">
          <Target className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">{t("study.puzzles.emptyTitle")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {t("study.puzzles.emptyBody")}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/games">{t("study.puzzles.openMyGames")}</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <ChessBoard
              pieces={pieces}
              orientation={puzzle.color as Color}
              turn={position.turn() as Color}
              legalTargets={(square) =>
                verdict === "idle"
                  ? position.moves({ square: square as never, verbose: true }).map((m) => m.to as string)
                  : []
              }
              canMoveFrom={(square) => {
                if (verdict !== "idle") return false;
                const piece = position.get(square as never);
                return !!piece && piece.color === position.turn();
              }}
              onMove={submit}
              needsPromotion={(from, to) => {
                const piece = position.get(from as never);
                if (!piece || piece.type !== "p") return false;
                return to.endsWith(piece.color === "w" ? "8" : "1");
              }}
              lastMove={solver?.lastMove ?? null}
              checkSquare={null}
              interactive={verdict === "idle"}
            />
          </div>

          <aside className="space-y-4">
            <div className="panel p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("study.puzzles.puzzleCounter", { current: Math.min(index + 1, queue.length), total: queue.length })}
                </span>
                <span className="font-mono text-sm">{puzzle.rating}</span>
              </div>
              <p className="mt-2 text-sm">
                {t("study.puzzles.toMove", { color: puzzle.color === "w" ? "Trắng" : "Đen" })}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {puzzle.themes.length === 0 ? (
                  <span className="rounded bg-secondary px-2 py-0.5 text-2xs text-muted-foreground">
                    {t("study.puzzles.tactic")}
                  </span>
                ) : (
                  puzzle.themes.map((m) => (
                    <span key={m} className="rounded bg-secondary px-2 py-0.5 text-2xs">
                      {MOTIF_LABEL[m]}
                    </span>
                  ))
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {t("study.puzzles.lostChance", {
                  pct: Math.round(puzzle.swing),
                  retention: Math.round(retrievability(puzzle.srs.stability, 0) * 100),
                })}
              </p>
            </div>

            <div className="panel space-y-2 p-4">
              {verdict === "idle" ? (
                <>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setHinted(true);
                      toast.info(t("study.puzzles.hintToast"), {
                        description: t("study.puzzles.hintDesc", { square: puzzle.solution[solver?.playedPlies ?? 0]?.uci.slice(0, 2) ?? "" }),
                      });
                    }}
                  >
                    <Lightbulb className="size-4" /> {t("study.puzzles.hint")}
                  </Button>
                  <Button variant="ghost" className="w-full" onClick={next}>
                    {t("study.puzzles.skip")}
                  </Button>
                </>
              ) : (
                <>
                  <div
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                      verdict === "correct"
                        ? "bg-primary/15 text-primary"
                        : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {verdict === "correct" ? <Check className="size-4" /> : <X className="size-4" />}
                    {verdict === "correct" ? t("study.puzzles.solved") : t("study.puzzles.bestWas", { san: puzzle.solutionSan ?? puzzle.solution[0]?.uci ?? "" })}
                  </div>
                  <Button className="w-full" onClick={next}>
                    {t("study.puzzles.nextPuzzle")}
                  </Button>
                  <Button asChild variant="ghost" className="w-full">
                    <Link to="/games/$gameId" params={{ gameId: puzzle.gameId }}>
                      <RotateCcw className="size-4" /> {t("study.puzzles.openSourceGame")}
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl">{value}</div>
      {note && <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}
