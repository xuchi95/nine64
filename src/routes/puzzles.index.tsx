import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Check, Lightbulb, RotateCcw, Sparkles, Target, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import type { Color } from "@/hooks/useChessGame";
import { useGameHistory } from "@/lib/history";
import { MOTIF_LABEL } from "@/lib/analysis/motifs";
import { formatRating, isProvisional } from "@/lib/rating/glicko2";
import { addPuzzles, gradePuzzle, hydrateLearn, useLearnState } from "@/lib/learn/store";
import { generateFromLibrary, type Puzzle } from "@/lib/learn/puzzleGen";
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
  const games = useGameHistory();
  const learn = useLearnState();
  const [index, setIndex] = useState(0);
  const [verdict, setVerdict] = useState<Verdict>("idle");
  const [hinted, setHinted] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [preview, setPreview] = useState<{ from: string; to: string } | null>(null);

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
    setVerdict("idle");
    setHinted(false);
    setPreview(null);
    setStartedAt(Date.now());
  }, [puzzle?.id]);

  const position = useMemo(() => {
    if (!puzzle) return null;
    const chess = new Chess();
    try {
      chess.load(puzzle.fen);
    } catch {
      return null;
    }
    return chess;
  }, [puzzle?.id, puzzle?.fen]);

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
      toast.info("No new puzzles", {
        description:
          reviewedCount === 0
            ? "Run an engine review on a saved game first — puzzles come from your own mistakes."
            : "Every missed chance in your reviewed games is already in the deck.",
      });
      return;
    }
    toast.success(`${created} new puzzle${created === 1 ? "" : "s"}`, {
      description: "Built from positions where you gave away a real chance.",
    });
  };

  const submit = (from: string, to: string, promotion?: "q" | "r" | "b" | "n"): boolean => {
    if (!puzzle || verdict !== "idle") return false;
    const attempt = `${from}${to}${promotion && promotion !== "q" ? promotion : ""}`;
    const expected = puzzle.solution.length > 4 ? puzzle.solution : puzzle.solution.slice(0, 4);
    const correct = attempt.slice(0, 4) === expected.slice(0, 4);
    setPreview({ from, to });

    const seconds = (Date.now() - startedAt) / 1000;
    if (correct) {
      const grade = hinted ? 2 : seconds < 12 ? 4 : 3;
      gradePuzzle(puzzle.id, grade);
      setVerdict("correct");
      toast.success(hinted ? "Correct — with a hint" : "Correct!", {
        description: puzzle.solutionSan ? `Best move: ${puzzle.solutionSan}` : undefined,
      });
    } else {
      gradePuzzle(puzzle.id, 1);
      setVerdict("wrong");
      toast.error("Not the move", {
        description: puzzle.solutionSan ? `The win was ${puzzle.solutionSan}.` : undefined,
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
          <h1 className="text-2xl font-bold">Puzzles from your games</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every position here is a chance you actually missed. Scheduling uses spaced repetition.
          </p>
        </div>
        <Button onClick={generate}>
          <Sparkles className="size-4" /> Generate from my games
        </Button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-4">
        <Stat label="Puzzle rating" value={formatRating(learn.rating.rating, learn.rating.rd)} note={isProvisional(learn.rating.rd) ? "Provisional" : "Established"} />
        <Stat label="Deck" value={String(learn.puzzles.length)} note={`${dueCount} due now`} />
        <Stat label="Solved" value={String(solvedTotal)} note={`${attemptTotal} attempts`} />
        <Stat
          label="Success rate"
          value={attemptTotal === 0 ? "—" : `${Math.round((solvedTotal / attemptTotal) * 100)}%`}
          note="All time"
        />
      </div>

      {!puzzle || !position ? (
        <div className="panel mt-6 p-6 text-center">
          <Target className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">No puzzles yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Run an engine review on a saved game, then generate puzzles — the trainer extracts the
            positions where you threw away a real advantage.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/games">Open my games</Link>
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
              lastMove={preview}
              checkSquare={null}
              interactive={verdict === "idle"}
            />
          </div>

          <aside className="space-y-4">
            <div className="panel p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Puzzle {Math.min(index + 1, queue.length)} / {queue.length}
                </span>
                <span className="font-mono text-sm">{puzzle.rating}</span>
              </div>
              <p className="mt-2 text-sm">
                {puzzle.color === "w" ? "White" : "Black"} to move — find the move you missed.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {puzzle.themes.length === 0 ? (
                  <span className="rounded bg-secondary px-2 py-0.5 text-2xs text-muted-foreground">
                    Tactic
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
                You lost {Math.round(puzzle.swing)}% win chance here · retention{" "}
                {Math.round(retrievability(puzzle.srs.stability, 0) * 100)}%
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
                      toast.info("Hint", {
                        description: `Start with the piece on ${puzzle.solution.slice(0, 2)}.`,
                      });
                    }}
                  >
                    <Lightbulb className="size-4" /> Hint
                  </Button>
                  <Button variant="ghost" className="w-full" onClick={next}>
                    Skip
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
                    {verdict === "correct" ? "Solved" : `Best was ${puzzle.solutionSan ?? puzzle.solution}`}
                  </div>
                  <Button className="w-full" onClick={next}>
                    Next puzzle
                  </Button>
                  <Button asChild variant="ghost" className="w-full">
                    <Link to="/games/$gameId" params={{ gameId: puzzle.gameId }}>
                      <RotateCcw className="size-4" /> Open source game
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
