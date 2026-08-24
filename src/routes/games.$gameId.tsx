import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  FlipVertical2,
  Gauge,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { EvalGraph } from "@/components/game/EvalGraph";
import { MoveList } from "@/components/game/MoveList";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import type { Color } from "@/hooks/useChessGame";
import { attachReview, formatEval, outcomeLabel, toPgn, useSavedGame } from "@/lib/history";
import { reviewGame } from "@/lib/engine/review";
import { useSettings } from "@/lib/settings";

export const Route = createFileRoute("/games/$gameId")({
  head: () => ({
    meta: [
      { title: `Game detail — ${APP.name}` },
      {
        name: "description",
        content:
          "Replay a saved game move by move with an evaluation graph, accuracy per side and PGN export.",
      },
      { property: "og:title", content: `Game detail — ${APP.name}` },
      {
        property: "og:description",
        content: "Move-by-move replay with engine evaluation and accuracy.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GameDetail,
});

function GameDetail() {
  const { gameId } = Route.useParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const game = useSavedGame(gameId);

  // -1 = starting position, otherwise index into moves.
  const [cursor, setCursor] = useState(-1);
  const [orientation, setOrientation] = useState<Color>("w");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  useEffect(() => {
    if (game) setCursor(game.moves.length - 1);
    if (game?.playerColor) setOrientation(game.playerColor);
  }, [game?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const signal = cancelRef.current;
    return () => {
      signal.cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!game) return;
      if (e.key === "ArrowLeft") setCursor((c) => Math.max(-1, c - 1));
      if (e.key === "ArrowRight") setCursor((c) => Math.min(game.moves.length - 1, c + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game?.id, game?.moves.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const fen = useMemo(() => {
    if (!game) return null;
    if (cursor < 0) return game.startFen;
    return game.moves[Math.min(cursor, game.moves.length - 1)]?.fen ?? game.startFen;
  }, [game, cursor]);

  const position = useMemo(() => {
    if (!fen) return null;
    const chess = new Chess();
    try {
      chess.load(fen);
    } catch {
      return null;
    }
    const pieces = chess
      .board()
      .flat()
      .filter((sq): sq is NonNullable<typeof sq> => sq !== null)
      .map((sq) => ({ square: sq.square as string, type: sq.type, color: sq.color }));
    let checkSquare: string | null = null;
    if (chess.isCheck()) {
      for (const row of chess.board()) {
        for (const sq of row) {
          if (sq && sq.type === "k" && sq.color === chess.turn()) checkSquare = sq.square as string;
        }
      }
    }
    return { pieces, turn: chess.turn() as Color, checkSquare };
  }, [fen]);

  if (!game) {
    return (
      <AppShell>
        <h1 className="text-2xl font-bold">Game not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This game is no longer in your local archive.
        </p>
        <Button asChild className="mt-4">
          <Link to="/games">Back to my games</Link>
        </Button>
      </AppShell>
    );
  }

  const lastMove = cursor >= 0 ? game.moves[cursor] ?? null : null;
  const evalNow =
    game.review === undefined
      ? null
      : cursor < 0
        ? game.review.startEval
        : (game.review.evals[cursor] ?? null);

  const runReview = async () => {
    cancelRef.current = { cancelled: false };
    setProgress({ done: 0, total: game.moves.length + 1 });
    try {
      const review = await reviewGame({
        startFen: game.startFen,
        moves: game.moves,
        performance: settings.enginePerformance,
        onProgress: (done, total) => setProgress({ done, total }),
        signal: cancelRef.current,
      });
      attachReview(game.id, review);
      toast.success("Review complete", {
        description: `Accuracy — White ${review.accuracy.w}%, Black ${review.accuracy.b}%`,
      });
    } catch (e) {
      toast.error("Review failed", { description: (e as Error).message });
    } finally {
      setProgress(null);
    }
  };

  return (
    <AppShell wide>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/games" })}>
          <ArrowLeft className="size-4" /> My games
        </Button>
        <h1 className="font-display text-xl font-bold">
          {game.white.name} <span className="text-muted-foreground">vs</span> {game.black.name}
        </h1>
        <span className="rounded bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">
          {outcomeLabel(game)} · {game.result.reason}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="mx-auto w-full max-w-[720px]">
          {position && (
            <ChessBoard
              pieces={position.pieces}
              orientation={orientation}
              turn={position.turn}
              legalTargets={() => []}
              canMoveFrom={() => false}
              onMove={() => false}
              needsPromotion={() => false}
              interactive={false}
              lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
              checkSquare={position.checkSquare}
            />
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" aria-label="First move" onClick={() => setCursor(-1)}>
              <SkipBack className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous move"
              onClick={() => setCursor((c) => Math.max(-1, c - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next move"
              onClick={() => setCursor((c) => Math.min(game.moves.length - 1, c + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Last move"
              onClick={() => setCursor(game.moves.length - 1)}
            >
              <SkipForward className="size-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
            >
              <FlipVertical2 className="size-4" /> Flip
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate({ to: "/analysis", search: { fen: fen ?? game.finalFen } })}
            >
              Open in analysis
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard
                  .writeText(toPgn(game))
                  .then(() => toast.success("PGN copied to clipboard"))
                  .catch(() => toast.error("Clipboard unavailable"));
              }}
            >
              <Copy className="size-4" /> PGN
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Evaluation
              </h2>
              <span className="tabular text-sm font-semibold">{formatEval(evalNow)}</span>
            </div>
            {game.review ? (
              <>
                <EvalGraph
                  className="mt-3"
                  startEval={game.review.startEval}
                  evals={game.review.evals}
                  activeIndex={cursor}
                  onSelect={setCursor}
                />
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-surface-2 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      White accuracy
                    </p>
                    <p className="tabular font-display text-xl font-bold">
                      {game.review.accuracy.w}%
                    </p>
                  </div>
                  <div className="rounded-md bg-surface-2 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Black accuracy
                    </p>
                    <p className="tabular font-display text-xl font-bold">
                      {game.review.accuracy.b}%
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="mt-3 w-full"
                  disabled={progress !== null}
                  onClick={runReview}
                >
                  <Gauge className="size-4" /> Re-run review
                </Button>
              </>
            ) : (
              <div className="mt-3">
                <p className="text-sm text-muted-foreground">
                  Run an engine review to get an evaluation curve for every move plus accuracy for
                  both sides. Everything is computed on your device.
                </p>
                <Button className="mt-3 w-full" disabled={progress !== null} onClick={runReview}>
                  <Gauge className="size-4" />
                  {progress
                    ? `Reviewing ${progress.done}/${progress.total}…`
                    : "Run engine review"}
                </Button>
              </div>
            )}
            {progress && game.review && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Reviewing {progress.done}/{progress.total}…
              </p>
            )}
          </div>

          <div className="panel flex max-h-[420px] flex-col overflow-hidden">
            <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Moves
            </div>
            <MoveList moves={game.moves} activeIndex={cursor} onSelect={setCursor} />
          </div>

          <div className="panel space-y-2 p-4 text-sm">
            <Row label="Mode" value={game.mode === "ai" ? "Vs engine" : "Local two player"} />
            <Row label="Variant" value={game.variantName} />
            <Row label="Time control" value={game.timeControl} />
            <Row label="Opening" value={game.opening ?? "—"} />
            <Row label="Moves" value={String(game.moves.length)} />
            <Row label="Played" value={new Date(game.playedAt).toLocaleString()} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}
