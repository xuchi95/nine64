import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ChevronLeft, ChevronRight, Copy, LineChart, Play, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { MoveList } from "@/components/game/MoveList";
import { EvalGraph } from "@/components/game/EvalGraph";
import { GamePanel } from "@/components/game/GamePanel";
import { gameLabelClass } from "@/components/game/GameLayout";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP } from "@/config/app";
import { useChessGame, type Color } from "@/hooks/useChessGame";
import { StockfishEngine, type EngineLine } from "@/lib/engine/stockfish";
import { useSettings } from "@/lib/settings";
import { BoardSkeleton } from "@/components/layout/PageSkeleton";
import { pageHead } from "@/lib/seo";

const searchSchema = z.object({ fen: z.string().optional() });

export const Route = createFileRoute("/analysis")({
  validateSearch: searchSchema,
  head: () =>
    pageHead({
      path: "/analysis",
      title: `Bàn phân tích — ${APP.name}`,
      description:
        "Dựng bất kỳ thế cờ nào trên bàn phân tích Nine64 và để Stockfish chỉ ra nước đi tốt nhất cùng biến chính.",
    }),) setLoadError("That position could not be loaded.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFen]);

  const canMoveFrom = useCallback(
    (square: string) => {
      const piece = game.game.current.get(square as never);
      return !!piece && piece.color === game.turn;
    },
    [game],
  );

  const analyse = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setAnalysing(true);
    try {
      const result = await engine.search({
        fen: game.fen,
        moveTimeMs: 2500,
        multiPv: 3,
        skill: null,
        uciElo: null,
      });
      setLines(result);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setAnalysing(false);
    }
  };

  const scanTrend = async () => {
    const engine = engineRef.current;
    if (!engine || game.moves.length === 0 || scanning) return;
    setScanning(true);
    setScanProgress(0);
    const out: (number | null)[] = [];
    try {
      for (let i = 0; i < game.moves.length; i++) {
        const fen = game.moves[i]!.fen;
        const res = await engine.search({ fen, moveTimeMs: 350, multiPv: 1, skill: null, uciElo: null });
        const best = res[0];
        const cpMover = best
          ? best.mateIn !== null
            ? best.mateIn > 0
              ? 10000
              : -10000
            : (best.cp ?? 0)
          : null;
        const blackToMove = fen.split(" ")[1] === "b";
        out.push(cpMover === null ? null : blackToMove ? -cpMover : cpMover);
        setTrend([...out]);
        setScanProgress(Math.round(((i + 1) / game.moves.length) * 100));
      }
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const handleLoadFen = () => {
    setLines([]);
    setTrend([]);
    if (game.loadFen(fenInput.trim())) setLoadError(null);
    else setLoadError("Invalid FEN.");
  };


  return (
    <AppShell wide>
      <h1 className="sr-only">Analysis board</h1>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="mx-auto w-full max-w-[720px]">
          <ChessBoard
            pieces={game.board}
            orientation={orientation}
            legalTargets={game.legalTargets}
            canMoveFrom={canMoveFrom}
            onMove={(from, to, promo) => {
              setLines([]);
              setTrend([]);
              return game.makeMove(from, to, promo);
            }}
            needsPromotion={game.needsPromotion}
            lastMove={game.lastMove}
            checkSquare={game.checkSquare}
            turn={game.turn}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
              <ChevronLeft className="size-4" />
              Flip
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                game.reset();
                setLines([]);
                setTrend([]);
              }}
            >

              <RotateCcw className="size-4" /> Reset
            </Button>
            <Button onClick={analyse} disabled={analysing}>
              <Play className="size-4" /> {analysing ? "Analysing…" : "Analyse position"}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <GamePanel
            title="Engine lines"
            meta={
              lines.length > 0 ? (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-2xs font-semibold text-primary">
                  Depth {Math.max(...lines.map((l) => l.depth))}
                </span>
              ) : analysing ? (
                <span className="flex items-center gap-1.5 text-2xs font-semibold text-primary">
                  <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                  Searching
                </span>
              ) : null
            }
            bodyClassName="p-3"
          >
            {lines.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                {analysing
                  ? "Stockfish đang tính toán…"
                  : "Chạy phân tích để xem các nước tiếp theo tốt nhất."}
              </p>
            ) : (
              <ul className="space-y-1">
                {lines.map((l, i) => {
                  const score =
                    l.mateIn !== null
                      ? `M${Math.abs(l.mateIn)}`
                      : `${(l.cp ?? 0) >= 0 ? "+" : ""}${((l.cp ?? 0) / 100).toFixed(2)}`;
                  return (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-lg p-2 transition-colors duration-200 hover:bg-surface-2"
                    >
                      <span
                        className={cn(
                          "tabular mt-px min-w-[3rem] rounded px-1.5 py-0.5 text-center text-2xs font-bold",
                          i === 0
                            ? "bg-primary text-primary-foreground"
                            : "bg-surface-2 text-muted-foreground",
                        )}
                      >
                        {score}
                      </span>
                      <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground/85">
                        <span className="font-semibold text-foreground">
                          {l.pv.slice(0, 2).join(" ")}
                        </span>{" "}
                        {l.pv.slice(2, 8).join(" ")}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </GamePanel>

          <GamePanel
            title="Eval trend"
            meta={
              scanning ? (
                <span className="flex items-center gap-1.5 text-2xs font-semibold text-primary">
                  <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                  {scanProgress}%
                </span>
              ) : trend.length > 0 ? (
                <span className="tabular rounded bg-surface-2 px-1.5 py-0.5 text-2xs font-semibold text-primary">
                  {(() => {
                    const last = [...trend].reverse().find((v) => v !== null) ?? 0;
                    return `${last >= 0 ? "+" : ""}${(last / 100).toFixed(2)}`;
                  })()}
                </span>
              ) : null
            }
            bodyClassName="flex flex-col gap-3 p-3"
          >
            {trend.length > 0 ? (
              <EvalGraph
                startEval={0}
                evals={trend}
                activeIndex={trend.length - 1}
              />
            ) : (
              <p className="px-1 py-3 text-center text-xs text-muted-foreground">
                {game.moves.length === 0
                  ? "Đi vài nước rồi quét để xem xu hướng tốt/xấu."
                  : "Quét eval để vẽ biểu đồ đường theo từng nước."}
              </p>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={scanTrend}
              disabled={scanning || game.moves.length === 0}
            >
              <LineChart className="size-4" /> {scanning ? "Đang quét…" : "Quét eval từng nước"}
            </Button>
          </GamePanel>


          <GamePanel
            title="Moves"
            meta={game.moves.length > 0 ? `${Math.ceil(game.moves.length / 2)} lượt` : undefined}
            className="max-h-[340px]"
          >
            <MoveList moves={game.moves} />
          </GamePanel>

          <GamePanel title="Load FEN" bodyClassName="flex flex-col gap-3 p-4">
            <Input
              id="fen"
              value={fenInput}
              onChange={(e) => setFenInput(e.target.value)}
              placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
              className="tabular bg-surface-2 text-xs"
            />
            <Button className="w-full" onClick={handleLoadFen}>
              Load position
            </Button>
            {loadError && <p className="text-xs font-medium text-destructive">{loadError}</p>}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className={gameLabelClass}>Current position</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(game.fen)}
                  className="flex items-center gap-1 rounded px-1 py-0.5 text-2xs font-semibold text-muted-foreground transition-colors hover:text-primary"
                >
                  <Copy className="size-3" /> Copy
                </button>
              </div>
              <code className="tabular block break-all rounded-md border border-border bg-surface-2 p-2 text-xs leading-tight text-muted-foreground">
                {game.fen}
              </code>
            </div>
          </GamePanel>

        </div>
      </div>
    </AppShell>
  );
}
