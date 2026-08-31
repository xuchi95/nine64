import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Copy, ExternalLink, FlipHorizontal, Rewind, Zap } from "lucide-react";
import { ChessBoard, type BoardPiece } from "@/components/chess/ChessBoard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rulesFor } from "@/lib/chess/rules";
import { StockfishEngine, type EngineLine } from "@/lib/engine/stockfish";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { BroadcastGameDetail } from "@/lib/watch/types";
import type { PieceColor } from "@/components/chess/Piece";

/** mm:ss (or h:mm:ss) for a clock value coming from the PGN source. */
function formatClock(ms: number | null): string | null {
  if (ms === null || ms < 0) return null;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatEval(cp: number | null, mate: number | null): string | null {
  if (mate !== null) return `M${Math.abs(mate)}${mate < 0 ? "−" : ""}`;
  if (cp === null) return null;
  const pawns = cp / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function piecesFor(fen: string): BoardPiece[] {
  const rules = rulesFor("standard");
  try {
    return rules.createPosition(fen).boardPieces();
  } catch {
    return rules.createPosition().boardPieces();
  }
}

/**
 * Read-only broadcast board.
 *
 * Everything the spectator can do — flip, step through moves, run the engine —
 * is local state. The canonical broadcast (`game`) is never written back to,
 * so one viewer can never affect another's board or the ingested stream.
 */
export function BroadcastBoard({ game }: { game: BroadcastGameDetail }) {
  const { t } = useT();
  const [orientation, setOrientation] = useState<PieceColor>("w");
  /** null = follow the live position; a number pins the view to that ply. */
  const [pinnedPly, setPinnedPly] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [engineOn, setEngineOn] = useState(false);
  const [lines, setLines] = useState<EngineLine[]>([]);
  const engineRef = useRef<StockfishEngine | null>(null);

  const moves = game.moves;
  const startFen = game.startFen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const viewIndex = pinnedPly === null ? moves.length - 1 : pinnedPly;
  const viewFen = viewIndex >= 0 && moves[viewIndex] ? moves[viewIndex].fen : startFen;
  const pieces = useMemo(() => piecesFor(viewFen), [viewFen]);
  const turn: PieceColor = viewFen.split(" ")[1] === "b" ? "b" : "w";

  const goto = useCallback(
    (index: number) => {
      const clamped = Math.max(-1, Math.min(moves.length - 1, index));
      setPinnedPly(clamped === moves.length - 1 ? null : clamped);
    },
    [moves.length],
  );

  // Local engine: spun up on demand and torn down when toggled off or unmounted.
  useEffect(() => {
    if (!engineOn) {
      engineRef.current?.destroy();
      engineRef.current = null;
      setLines([]);
      return;
    }
    let cancelled = false;
    const engine = engineRef.current ?? new StockfishEngine();
    engineRef.current = engine;
    void engine
      .search({ fen: viewFen, depth: 16, multiPv: 2 })
      .then((result) => {
        if (!cancelled) setLines(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [engineOn, viewFen]);

  // Always release the worker when the board unmounts.
  useEffect(
    () => () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    },
    [],
  );

  const copyPgn = useCallback(async () => {
    if (!game.pgn) return;
    try {
      await navigator.clipboard.writeText(game.pgn);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — nothing to recover, the PGN link still works.
    }
  }, [game.pgn]);

  const statusLabel =
    game.status === "live"
      ? t("wc.board.live")
      : game.status === "finished"
        ? t("wc.board.finished")
        : t("wc.board.scheduled");

  const evalText = formatEval(game.evalCp, game.evalMate);
  const whiteClock = formatClock(game.whiteClockMs);
  const blackClock = formatClock(game.blackClockMs);

  const pairs = useMemo(() => {
    const out: { no: number; white?: { san: string; index: number }; black?: { san: string; index: number } }[] = [];
    moves.forEach((m, index) => {
      const no = Math.floor(index / 2) + 1;
      const slot = index % 2 === 0 ? "white" : "black";
      const existing = out.find((p) => p.no === no) ?? (out.push({ no }), out[out.length - 1]!);
      existing[slot] = { san: m.san, index };
    });
    return out;
  }, [moves]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-3">
        <PlayerLine
          name={orientation === "w" ? game.blackName : game.whiteName}
          title={orientation === "w" ? game.blackTitle : game.whiteTitle}
          rating={orientation === "w" ? game.blackRating : game.whiteRating}
          clock={orientation === "w" ? blackClock : whiteClock}
          eventSlug={game.eventSlug}
        />
        <ChessBoard
          pieces={pieces}
          orientation={orientation}
          turn={turn}
          interactive={false}
          legalTargets={() => []}
          canMoveFrom={() => false}
          onMove={() => false}
          needsPromotion={() => false}
        />
        <PlayerLine
          name={orientation === "w" ? game.whiteName : game.blackName}
          title={orientation === "w" ? game.whiteTitle : game.blackTitle}
          rating={orientation === "w" ? game.whiteRating : game.blackRating}
          clock={orientation === "w" ? whiteClock : blackClock}
          eventSlug={game.eventSlug}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
            <FlipHorizontal className="mr-1 size-4" /> {t("wc.board.flip")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => goto(-1)} aria-label={t("wc.board.start")}>
            <Rewind className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => goto(viewIndex - 1)} aria-label={t("wc.board.prev")}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => goto(viewIndex + 1)} aria-label={t("wc.board.next")}>
            <ChevronRight className="size-4" />
          </Button>
          {pinnedPly !== null && (
            <Button variant="ghost" size="sm" onClick={() => setPinnedPly(null)}>
              {t("wc.board.latest")}
            </Button>
          )}
          <Button
            variant={engineOn ? "default" : "outline"}
            size="sm"
            onClick={() => setEngineOn((v) => !v)}
          >
            <Zap className="mr-1 size-4" /> {t("wc.board.engine")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void copyPgn()} disabled={!game.pgn}>
            <Copy className="mr-1 size-4" /> {copied ? t("wc.board.copied") : t("wc.board.copyPgn")}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/analysis" search={{ fen: viewFen }}>
              <ExternalLink className="mr-1 size-4" /> {t("wc.board.openAnalysis")}
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("wc.board.readonly")}</p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Badge variant={game.status === "live" ? "default" : "secondary"}>{statusLabel}</Badge>
              <span className="font-mono text-sm">{game.result}</span>
              {evalText && <span className="ml-auto font-mono text-sm text-brass">{evalText}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>
              <Link to="/events/$slug" params={{ slug: game.eventSlug }} className="font-semibold text-foreground underline">
                {game.eventName}
              </Link>
            </p>
            <p>
              {game.roundNumber ? `${t("wc.board.round", { n: game.roundNumber })} · ` : ""}
              {t("wc.board.board", { n: game.board })}
            </p>
            {game.openingName && (
              <p>
                {t("wc.board.opening")}: <span className="text-foreground">{game.eco} {game.openingName}</span>
              </p>
            )}
          </CardContent>
        </Card>

        {engineOn && lines.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("wc.board.engineOn")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 font-mono text-xs">
              {lines.map((line, i) => (
                <p key={i} className="truncate text-muted-foreground">
                  <span className="text-brass">
                    {line.mateIn !== null ? `M${line.mateIn}` : ((line.cp ?? 0) / 100).toFixed(2)}
                  </span>{" "}
                  {line.pv.slice(0, 8).join(" ")}
                </p>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("wc.board.moves")}</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[26rem] overflow-y-auto">
            <ol className="grid grid-cols-[2.5rem_1fr_1fr] gap-y-0.5 text-sm">
              {pairs.map((pair) => (
                <li key={pair.no} className="contents">
                  <span className="py-0.5 font-mono text-xs text-muted-foreground">{pair.no}.</span>
                  {(["white", "black"] as const).map((side) => {
                    const cell = pair[side];
                    if (!cell) return <span key={side} />;
                    return (
                      <button
                        key={side}
                        type="button"
                        onClick={() => goto(cell.index)}
                        className={cn(
                          "rounded px-1.5 py-0.5 text-left font-mono transition-colors hover:bg-accent/40",
                          cell.index === viewIndex && "bg-primary/15 font-semibold text-primary",
                        )}
                      >
                        {cell.san}
                      </button>
                    );
                  })}
                </li>
              ))}
            </ol>
            {moves.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PlayerLine({
  name,
  title,
  rating,
  clock,
  eventSlug: _eventSlug,
}: {
  name: string;
  title: string | null;
  rating: number | null;
  clock: string | null;
  eventSlug: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3 py-2">
      {title && <Badge variant="outline" className="font-mono text-[0.65rem]">{title}</Badge>}
      <span className="truncate font-semibold">{name}</span>
      {rating !== null && <span className="font-mono text-xs text-muted-foreground">{rating}</span>}
      {clock && <span className="ml-auto font-mono text-sm tabular-nums">{clock}</span>}
    </div>
  );
}
