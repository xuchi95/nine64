import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Compass,
  Play,
  RotateCcw,
  Target,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { GamePanel } from "@/components/game/GamePanel";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { useGameHistory } from "@/lib/history";
import { useSettings } from "@/lib/settings";
import { StockfishEngine, type EngineLine } from "@/lib/engine/stockfish";
import { pvToArrows, pvToSan } from "@/lib/chess/endgame";
import { buildOpeningTree, childRows, nodeAtPath } from "@/lib/openings/tree";
import {
  focusSuggestions,
  summariseRepertoire,
  topLines,
  type Side,
  type TrainingFocus,
} from "@/lib/openings/explorer";
import { DashboardSkeleton } from "@/components/layout/PageSkeleton";
import { pageHead } from "@/lib/seo";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const STAT_DEPTH = 6;

export const Route = createFileRoute("/openings")({
  head: () =>
    pageHead({
      path: "/openings",
      title: `Thư viện khai cuộc — ${APP.name}`,
      description:
        "Duyệt cây khai cuộc cá nhân, so sánh với biến chính của máy và nhận lộ trình luyện tập trọng điểm dựa trên các ván đã chơi.",
    }),
  pendingComponent: DashboardSkeleton,
  component: OpeningExplorer,
});

function moveNumberLabel(ply: number) {
  const no = Math.floor(ply / 2) + 1;
  return ply % 2 === 0 ? `${no}.` : `${no}…`;
}

function pathLabel(sans: string[]) {
  return sans.map((san, i) => `${moveNumberLabel(i)} ${san}`).join(" ");
}

function OpeningExplorer() {
  const { t } = useT();
  const settings = useSettings();
  const games = useGameHistory();
  const [side, setSide] = useState<Side>("w");
  const [sans, setSans] = useState<string[]>([]);
  const [orientation, setOrientation] = useState<Side>("w");
  const [lines, setLines] = useState<EngineLine[]>([]);
  const [analysing, setAnalysing] = useState(false);
  const engineRef = useRef<StockfishEngine | null>(null);

  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  const sideGames = useMemo(
    () => games.filter((g) => ((g.playerColor ?? "w") as Side) === side),
    [games, side],
  );
  const tree = useMemo(() => buildOpeningTree(sideGames), [sideGames]);
  const node = useMemo(() => nodeAtPath(tree, sans.join(" ")), [tree, sans]);
  const rows = useMemo(() => (node ? childRows(node) : []), [node]);
  const summary = useMemo(() => summariseRepertoire(games, side, STAT_DEPTH), [games, side]);
  const played = useMemo(() => topLines(games, side, STAT_DEPTH, 1).slice(0, 8), [games, side]);
  const focus = useMemo(() => focusSuggestions(games, STAT_DEPTH), [games]);

  const position = useMemo(() => {
    const chess = new Chess();
    for (const san of sans) {
      try {
        if (!chess.move(san)) break;
      } catch {
        break;
      }
    }
    const pieces = chess
      .board()
      .flat()
      .filter((sq): sq is NonNullable<typeof sq> => sq !== null)
      .map((sq) => ({ square: sq.square as string, type: sq.type, color: sq.color }));
    let checkSquare: string | null = null;
    if (chess.isCheck()) {
      for (const row of chess.board())
        for (const sq of row)
          if (sq && sq.type === "k" && sq.color === chess.turn()) checkSquare = sq.square as string;
    }
    return { chess, pieces, fen: chess.fen(), turn: chess.turn() as Side, checkSquare };
  }, [sans]);

  const lastMove = useMemo(() => {
    const history = position.chess.history({ verbose: true });
    const last = history[history.length - 1];
    return last ? { from: last.from as string, to: last.to as string } : null;
  }, [position]);

  const openingName = useMemo(() => node?.openingName ?? null, [node]);

  const push = (san: string) => {
    setLines([]);
    setSans((prev) => [...prev, san]);
  };

  const analyse = async () => {
    if (!engineRef.current) engineRef.current = new StockfishEngine(settings.enginePerformance);
    const engine = engineRef.current;
    setAnalysing(true);
    try {
      await engine.init();
      const result = await engine.search({
        fen: position.fen,
        moveTimeMs: 2000,
        multiPv: 3,
        skill: null,
        uciElo: null,
      });
      setLines(result);
    } catch {
      setLines([]);
    } finally {
      setAnalysing(false);
    }
  };

  const arrows = useMemo(() => {
    const line = lines[0];
    if (!line) return [];
    return pvToArrows(position.fen, line.pv, 3).map((a) => ({ from: a.from, to: a.to, ply: a.ply }));
  }, [lines, position.fen]);

  const scoreLabel = (line: EngineLine) => {
    if (line.mateIn !== null) return t("study.openings.mateIn", { n: Math.abs(line.mateIn) });
    if (line.cp === null) return "–";
    const white = position.turn === "w" ? line.cp : -line.cp;
    return `${white > 0 ? "+" : ""}${(white / 100).toFixed(2)}`;
  };

  if (games.length === 0) {
    return (
      <AppShell wide>
        <h1 className="text-2xl font-bold">{t("study.openings.title")}</h1>
        <div className="panel mt-6 p-6 text-center">
          <BookOpen className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">{t("study.openings.emptyTitle")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {t("study.openings.emptyBody")}
          </p>
          <Button asChild className="mt-4">
            <Link to="/play">{t("study.openings.playNow")}</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      <h1 className="text-2xl font-bold">{t("study.openings.title")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {t("study.openings.subtitle")}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(["w", "b"] as Side[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={side === s ? "default" : "outline"}
            onClick={() => {
              setSide(s);
              setOrientation(s);
              setSans([]);
              setLines([]);
            }}
          >
            {s === "w" ? t("study.openings.asWhite") : t("study.openings.asBlack")}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground">
          {t("study.openings.summaryScore", {
            score: summary.score,
            games: summary.games,
            lines: summary.distinctLines,
          })}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="mx-auto w-full max-w-[560px]">
            <ChessBoard
              pieces={position.pieces}
              orientation={orientation}
              legalTargets={(square) =>
                position.chess
                  .moves({ square: square as never, verbose: true })
                  .map((m) => m.to as string)
              }
              canMoveFrom={(square) => {
                const piece = position.chess.get(square as never);
                return !!piece && piece.color === position.turn;
              }}
              onMove={(from, to, promotion) => {
                try {
                  const probe = new Chess(position.fen);
                  const move = probe.move({ from, to, promotion: promotion ?? "q" });
                  if (!move) return false;
                  push(move.san);
                  return true;
                } catch {
                  return false;
                }
              }}
              needsPromotion={(from, to) => {
                const piece = position.chess.get(from as never);
                if (!piece || piece.type !== "p") return false;
                return (
                  (piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1")
                );
              }}
              lastMove={lastMove}
              checkSquare={position.checkSquare}
              arrows={arrows}
              turn={position.turn}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={sans.length === 0}
                onClick={() => {
                  setLines([]);
                  setSans((prev) => prev.slice(0, -1));
                }}
              >
                <ChevronLeft className="size-4" /> {t("study.openings.back")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={sans.length === 0}
                onClick={() => {
                  setLines([]);
                  setSans([]);
                }}
              >
                <RotateCcw className="size-4" /> {t("study.openings.resetLine")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
              >
                {t("study.openings.flip")} <ChevronRight className="size-4" />
              </Button>
              <Button size="sm" onClick={analyse} disabled={analysing}>
                <Play className="size-4" />{" "}
                {analysing ? t("study.openings.analysing") : t("study.openings.analyse")}
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/analysis" search={{ fen: position.fen }}>
                  {t("study.openings.openInAnalysis")}
                </Link>
              </Button>
            </div>
          </div>

          <GamePanel title={t("study.openings.topLines")} bodyClassName="p-3">
            <p className="px-1 pb-2 text-2xs text-muted-foreground">
              {t("study.openings.lineDepth", { plies: STAT_DEPTH })}
            </p>
            <ul className="space-y-1">
              {played.map((line) => (
                <li key={line.path}>
                  <button
                    type="button"
                    onClick={() => {
                      setLines([]);
                      setSans(line.sans);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition hover:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs">
                        {pathLabel(line.sans)}
                      </span>
                      {line.opening ? (
                        <span className="block truncate text-2xs text-muted-foreground">
                          {line.opening}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-right font-mono text-2xs text-muted-foreground">
                      <span className="block">
                        {line.games} {t("study.openings.games")} · {line.score}%
                      </span>
                      {line.avgLoss !== null ? (
                        <span className="block">
                          {t("study.openings.avgLoss")} {line.avgLoss}%
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </GamePanel>
        </div>

        <div className="space-y-3">
          <GamePanel
            title={t("study.openings.position")}
            meta={
              <span className="text-2xs text-muted-foreground">
                {openingName ?? t("study.openings.startPosition")}
              </span>
            }
            bodyClassName="p-3"
          >
            <p className="px-1 font-mono text-xs break-words">
              {sans.length === 0 ? t("study.openings.startPosition") : pathLabel(sans)}
            </p>
          </GamePanel>

          <GamePanel title={t("study.openings.yourMoves")} bodyClassName="p-3">
            {rows.length === 0 ? (
              <p className="px-1 py-3 text-xs text-muted-foreground">
                {t("study.openings.noMoves")}
              </p>
            ) : (
              <ul className="space-y-1">
                {rows.map((row) => (
                  <li key={row.path}>
                    <button
                      type="button"
                      onClick={() => push(row.san)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-surface-2"
                    >
                      <span className="font-mono text-xs">
                        {moveNumberLabel(row.ply)} {row.san}
                      </span>
                      <span className="font-mono text-2xs text-muted-foreground">
                        {row.games} · {row.winRate}%
                        {row.avgLoss !== null ? ` · ${row.avgLoss}%` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </GamePanel>

          <GamePanel
            title={t("study.openings.engineLines")}
            meta={
              lines.length > 0 ? (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-2xs font-semibold text-primary">
                  {t("study.openings.depth", { depth: Math.max(...lines.map((l) => l.depth)) })}
                </span>
              ) : null
            }
            bodyClassName="p-3"
          >
            {lines.length === 0 ? (
              <p className="px-1 py-3 text-xs text-muted-foreground">
                {analysing ? t("study.openings.analysing") : t("study.openings.engineHint")}
              </p>
            ) : (
              <ul className="space-y-1">
                {lines.map((line, i) => (
                  <li
                    key={`${line.move}-${i}`}
                    className="flex items-start justify-between gap-2 rounded-md px-2 py-1.5"
                  >
                    <span className="min-w-0 font-mono text-xs break-words">
                      {pvToSan(position.fen, line.pv, 6).join(" ")}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-xs font-semibold",
                        i === 0 ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {scoreLabel(line)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </GamePanel>

          <GamePanel title={t("study.openings.focusPlan")} bodyClassName="p-3">
            {focus.length === 0 ? (
              <p className="px-1 py-3 text-xs text-muted-foreground">
                {t("study.openings.focusEmpty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {focus.map((item) => (
                  <FocusCard
                    key={item.id}
                    item={item}
                    onOpen={() => {
                      setSide(item.side);
                      setOrientation(item.side);
                      setSans(item.sans);
                      setLines([]);
                    }}
                  />
                ))}
              </ul>
            )}
          </GamePanel>
        </div>
      </div>
    </AppShell>
  );
}

function FocusCard({ item, onOpen }: { item: TrainingFocus; onOpen: () => void }) {
  const { t } = useT();
  return (
    <li className="rounded-lg border border-border/60 bg-surface-2/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{item.title}</h3>
        <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-primary">
          {t("study.openings.priority", { value: item.priority })}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
      <p className="mt-1 text-xs">{item.task}</p>
      <p className="mt-1 font-mono text-2xs text-muted-foreground break-words">
        {item.side === "w" ? t("study.openings.asWhite") : t("study.openings.asBlack")} ·{" "}
        {item.path}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onOpen}>
          <Compass className="size-4" /> {t("study.openings.focusOpen")}
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link to="/drills">
            <Target className="size-4" /> {t("study.openings.focusReview")}
          </Link>
        </Button>
      </div>
    </li>
  );
}
