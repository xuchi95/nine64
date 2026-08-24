import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ChevronLeft, ChevronRight, Play, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { MoveList } from "@/components/game/MoveList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP } from "@/config/app";
import { useChessGame, type Color } from "@/hooks/useChessGame";
import { StockfishEngine, type EngineLine } from "@/lib/engine/stockfish";
import { useSettings } from "@/lib/settings";

const searchSchema = z.object({ fen: z.string().optional() });

export const Route = createFileRoute("/analysis")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: `Analysis board — ${APP.name}` },
      {
        name: "description",
        content:
          "Explore any position on the Nexus Chess analysis board and ask Stockfish for the best continuation.",
      },
      { property: "og:title", content: `Analysis board — ${APP.name}` },
      {
        property: "og:description",
        content: "Free board with local Stockfish evaluation and principal variation.",
      },
    ],
  }),
  component: Analysis,
});

function Analysis() {
  const { fen: initialFen } = Route.useSearch();
  const settings = useSettings();
  const [orientation, setOrientation] = useState<Color>("w");
  const [fenInput, setFenInput] = useState(initialFen ?? "");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [lines, setLines] = useState<EngineLine[]>([]);
  const engineRef = useRef<StockfishEngine | null>(null);

  const game = useChessGame({ variant: "standard", timeControl: null });

  useEffect(() => {
    const engine = new StockfishEngine(settings.enginePerformance);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [settings.enginePerformance]);

  useEffect(() => {
    if (!initialFen) return;
    setFenInput(initialFen);
    if (!game.loadFen(initialFen)) setLoadError("That position could not be loaded.");
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

  const handleLoadFen = () => {
    setLines([]);
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
          <div className="panel p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Engine lines
            </h2>
            {lines.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {analysing
                  ? "Stockfish is searching…"
                  : "Run an analysis to see the top continuations."}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {lines.map((l, i) => (
                  <li key={i} className="rounded-md border border-border bg-surface-2 p-2 text-sm">
                    <span className="tabular mr-2 font-semibold text-primary">
                      {l.mateIn !== null
                        ? `M${Math.abs(l.mateIn)}`
                        : `${(l.cp ?? 0) >= 0 ? "+" : ""}${((l.cp ?? 0) / 100).toFixed(2)}`}
                    </span>
                    <span className="text-muted-foreground">depth {l.depth}</span>
                    <p className="mt-1 truncate font-mono text-xs">{l.pv.slice(0, 8).join(" ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel flex max-h-[340px] flex-col overflow-hidden">
            <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Moves
            </div>
            <MoveList moves={game.moves} />
          </div>

          <div className="panel space-y-2 p-4">
            <label className="text-xs uppercase tracking-wider text-muted-foreground" htmlFor="fen">
              Load FEN
            </label>
            <Input
              id="fen"
              value={fenInput}
              onChange={(e) => setFenInput(e.target.value)}
              placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
            />
            <Button variant="secondary" className="w-full" onClick={handleLoadFen}>
              Load position
            </Button>
            {loadError && <p className="text-xs text-destructive">{loadError}</p>}
            <p className="tabular break-all text-xs text-muted-foreground">{game.fen}</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
