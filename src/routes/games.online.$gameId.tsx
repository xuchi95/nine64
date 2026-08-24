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
import { useOnlineGame } from "@/hooks/useOnlineGames";
import { useAuth } from "@/lib/auth";
import { reviewGame } from "@/lib/engine/review";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/games/online/$gameId")({
  head: () => ({
    meta: [
      { title: `Online game detail — ${APP.name}` },
      {
        name: "description",
        content: "Replay an online ranked game move by move with engine evaluation.",
      },
      { property: "og:title", content: `Online game detail — ${APP.name}` },
      { property: "og:description", content: "Replay an online ranked game with engine evaluation." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnlineGameDetail,
});

function OnlineGameDetail() {
  const { gameId } = Route.useParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const { user } = useAuth();
  const { game, loading } = useOnlineGame(gameId);

  const [cursor, setCursor] = useState(-1);
  const [orientation, setOrientation] = useState<Color>("w");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [review, setReview] = useState<{ startEval: number | null; evals: (number | null)[]; accuracy: { w: number; b: number } } | null>(null);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  const isWhite = game?.white_id === user?.id;

  const moves = useMemo(() => {
    if (!game) return [];
    return game.moves.map((m) => ({
      san: m.san,
      from: m.uci.slice(0, 2),
      to: m.uci.slice(2, 4),
      color: (m.move_number % 2 === 1 ? "w" : "b") as Color,
      fen: m.fen,
    }));
  }, [game]);

  useEffect(() => {
    if (game) setCursor(moves.length - 1);
    if (game && isWhite) setOrientation("w");
    else if (game) setOrientation("b");
  }, [game?.id, moves.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (e.key === "ArrowRight") setCursor((c) => Math.min(moves.length - 1, c + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game?.id, moves.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const fen = useMemo(() => {
    if (!game) return null;
    if (cursor < 0) return game.initial_fen;
    return moves[Math.min(cursor, moves.length - 1)]?.fen ?? game.initial_fen;
  }, [game, cursor, moves]);

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

  if (loading) {
    return (
      <AppShell>
        <p className="text-muted-foreground">Loading game…</p>
      </AppShell>
    );
  }

  if (!game) {
    return (
      <AppShell>
        <h1 className="text-2xl font-bold">Game not found</h1>
        <Button asChild className="mt-4">
          <Link to="/games">Back to my games</Link>
        </Button>
      </AppShell>
    );
  }

  const opponentId = isWhite ? game.black_id : game.white_id;
  const opponentName = `Opponent ${opponentId.slice(0, 6)}`;
  const myName = user?.email?.split("@")[0] ?? "You";
  const whiteName = isWhite ? myName : opponentName;
  const blackName = isWhite ? opponentName : myName;

  let outcome = "In progress";
  if (game.status === "completed") {
    if (game.result === "1/2-1/2") outcome = "Draw";
    else if ((game.result === "1-0" && isWhite) || (game.result === "0-1" && !isWhite)) outcome = "Win";
    else outcome = "Loss";
  }

  const lastMove = cursor >= 0 ? moves[cursor] ?? null : null;
  const evalNow = review ? (cursor < 0 ? review.startEval : review.evals[cursor] ?? null) : null;

  const runReview = async () => {
    cancelRef.current = { cancelled: false };
    setProgress({ done: 0, total: moves.length + 1 });
    try {
      const result = await reviewGame({
        startFen: game.initial_fen,
        moves,
        performance: settings.enginePerformance,
        onProgress: (done, total) => setProgress({ done, total }),
        signal: cancelRef.current,
      });
      setReview(result);
      toast.success("Review complete", {
        description: `Accuracy — White ${result.accuracy.w}%, Black ${result.accuracy.b}%`,
      });
    } catch (e) {
      toast.error("Review failed", { description: (e as Error).message });
    } finally {
      setProgress(null);
    }
  };

  const toPgn = () => {
    const chess = new Chess();
    try {
      chess.load(game.initial_fen);
    } catch {
      chess.reset();
    }
    const headers = [
      `[Event "Nexus Chess Online ${game.time_control}"]`,
      `[Site "${APP.name}"]`,
      `[Date "${new Date(game.created_at).toISOString().slice(0, 10)}"]`,
      `[White "${whiteName}"]`,
      `[Black "${blackName}"]`,
      `[Result "${game.result}"]`,
      `[Variant "${game.variant}"]`,
      "",
    ];
    for (const m of moves) {
      try {
        chess.move(m.san);
      } catch {
        // ignore
      }
    }
    return headers.join("\n") + chess.pgn();
  };

  return (
    <AppShell wide>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/games" })}>
          <ArrowLeft className="size-4" /> My games
        </Button>
        <h1 className="font-display text-xl font-bold">
          {whiteName} <span className="text-muted-foreground">vs</span> {blackName}
        </h1>
        <span
          className={cn(
            "rounded px-2 py-1 text-xs font-semibold",
            outcome === "Win" && "bg-primary/20 text-primary",
            outcome === "Loss" && "bg-destructive/20 text-destructive",
            outcome === "Draw" && "bg-secondary text-muted-foreground",
            outcome === "In progress" && "bg-secondary text-muted-foreground",
          )}
        >
          {outcome} · {game.end_reason || game.status}
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
              onClick={() => setCursor((c) => Math.min(moves.length - 1, c + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Last move"
              onClick={() => setCursor(moves.length - 1)}
            >
              <SkipForward className="size-4" />
            </Button>
            <Button variant="outline" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
              <FlipVertical2 className="size-4" /> Flip
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard
                  .writeText(toPgn())
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
            {review ? (
              <>
                <EvalGraph
                  className="mt-3"
                  startEval={review.startEval ?? 0}
                  evals={review.evals}
                  activeIndex={cursor}
                  onSelect={setCursor}
                />
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-surface-2 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      White accuracy
                    </p>
                    <p className="tabular font-display text-xl font-bold">{review.accuracy.w}%</p>
                  </div>
                  <div className="rounded-md bg-surface-2 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Black accuracy
                    </p>
                    <p className="tabular font-display text-xl font-bold">{review.accuracy.b}%</p>
                  </div>
                </div>
                <Button variant="outline" className="mt-3 w-full" disabled={progress !== null} onClick={runReview}>
                  <Gauge className="size-4" /> Re-run review
                </Button>
              </>
            ) : (
              <div className="mt-3">
                <p className="text-sm text-muted-foreground">
                  Run an engine review to get an evaluation curve for every move plus accuracy for both sides.
                </p>
                <Button className="mt-3 w-full" disabled={progress !== null} onClick={runReview}>
                  <Gauge className="size-4" />
                  {progress ? `Reviewing ${progress.done}/${progress.total}…` : "Run engine review"}
                </Button>
              </div>
            )}
          </div>

          <div className="panel flex max-h-[420px] flex-col overflow-hidden">
            <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Moves
            </div>
            <MoveList moves={moves} activeIndex={cursor} onSelect={setCursor} />
          </div>

          <div className="panel space-y-2 p-4 text-sm">
            <Row label="Mode" value="Online ranked" />
            <Row label="Variant" value={game.variant} />
            <Row label="Time control" value={game.time_control} />
            <Row label="Moves" value={String(game.moves.length)} />
            <Row label="Played" value={new Date(game.created_at).toLocaleString()} />
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

function formatEval(eval_: number | null): string {
  if (eval_ === null) return "—";
  if (Math.abs(eval_) > 8) return eval_ > 0 ? "M+" : "M-";
  return (eval_ > 0 ? "+" : "") + eval_.toFixed(2);
}
