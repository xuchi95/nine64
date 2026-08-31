import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Play, Plus, RotateCcw, RefreshCw } from "lucide-react";
import { OpeningBoard, pathLabel } from "@/components/openings/OpeningBoard";
import { GamePanel } from "@/components/game/GamePanel";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { StockfishEngine, type EngineLine } from "@/lib/engine/stockfish";
import { pvToArrows, pvToSan } from "@/lib/chess/endgame";
import { fetchOpeningExplorer } from "@/lib/openings/explorer.functions";
import { saveRepertoireLine } from "@/lib/openings/repertoire.functions";
import {
  DEFAULT_FILTERS,
  EXPLORER_RATINGS,
  EXPLORER_SPEEDS,
  type ExplorerFilters,
  type ExplorerPosition,
  type ExplorerRating,
  type ExplorerSpeed,
} from "@/lib/openings/explorerTypes";
import { cn } from "@/lib/utils";
import { fenAfter } from "@/components/openings/OpeningBoard";

const YEARS = [1952, 1990, 2000, 2010, 2015, 2020, 2024];

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function ExplorerTab({ signedIn }: { signedIn: boolean }) {
  const { t } = useT();
  const settings = useSettings();
  const explorerFn = useServerFn(fetchOpeningExplorer);
  const saveLineFn = useServerFn(saveRepertoireLine);

  const [sans, setSans] = useState<string[]>([]);
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [filters, setFilters] = useState<ExplorerFilters>(DEFAULT_FILTERS);
  const [data, setData] = useState<ExplorerPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lines, setLines] = useState<EngineLine[]>([]);
  const [analysing, setAnalysing] = useState(false);
  const engineRef = useRef<StockfishEngine | null>(null);

  useEffect(
    () => () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await explorerFn({
        data: {
          sans,
          source: filters.source,
          speeds: filters.speeds,
          ratings: filters.ratings,
          sinceYear: filters.sinceYear,
        },
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "explorer_failed");
    } finally {
      setLoading(false);
    }
  }, [explorerFn, filters, sans]);

  useEffect(() => {
    void load();
  }, [load]);

  const fen = useMemo(() => fenAfter(sans), [sans]);

  const analyse = async () => {
    if (!engineRef.current) engineRef.current = new StockfishEngine(settings.enginePerformance);
    const engine = engineRef.current;
    setAnalysing(true);
    try {
      await engine.init();
      setLines(await engine.search({ fen, moveTimeMs: 2000, multiPv: 3, skill: null, uciElo: null }));
    } catch {
      setLines([]);
    } finally {
      setAnalysing(false);
    }
  };

  const arrows = useMemo(() => {
    const line = lines[0];
    if (!line) return [];
    return pvToArrows(fen, line.pv, 3).map((a) => ({ from: a.from, to: a.to, ply: a.ply }));
  }, [lines, fen]);

  const turn: "w" | "b" = sans.length % 2 === 0 ? "w" : "b";
  const scoreLabel = (line: EngineLine) => {
    if (line.mateIn !== null) return t("study.openings.mateIn", { n: Math.abs(line.mateIn) });
    if (line.cp === null) return "–";
    const white = turn === "w" ? line.cp : -line.cp;
    return `${white > 0 ? "+" : ""}${(white / 100).toFixed(2)}`;
  };

  const push = (san: string) => {
    setLines([]);
    setSans((prev) => [...prev, san]);
  };

  const addToRepertoire = async (color: "white" | "black") => {
    if (sans.length === 0) return;
    setNotice(null);
    try {
      await saveLineFn({
        data: {
          color,
          sans,
          name: data?.openingName ?? "",
          eco: data?.eco ?? null,
          openingName: data?.openingName ?? null,
          notes: "",
          kind: "main",
        },
      });
      setNotice(t("lab.explorer.added", { color: t(color === "white" ? "lab.white" : "lab.black") }));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "save_failed");
    }
  };

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-4">
        <div className="mx-auto w-full max-w-[560px]">
          <OpeningBoard sans={sans} orientation={orientation} onPush={push} arrows={arrows} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={!sans.length} onClick={() => setSans((p) => p.slice(0, -1))}>
              <ChevronLeft className="size-4" /> {t("study.openings.back")}
            </Button>
            <Button variant="outline" size="sm" disabled={!sans.length} onClick={() => setSans([])}>
              <RotateCcw className="size-4" /> {t("study.openings.resetLine")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
              {t("study.openings.flip")}
            </Button>
            <Button size="sm" onClick={analyse} disabled={analysing}>
              <Play className="size-4" /> {analysing ? t("study.openings.analysing") : t("study.openings.analyse")}
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/analysis" search={{ fen }}>
                {t("study.openings.openInAnalysis")}
              </Link>
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={!signedIn || !sans.length} onClick={() => addToRepertoire("white")}>
              <Plus className="size-4" /> {t("lab.explorer.addWhite")}
            </Button>
            <Button size="sm" variant="secondary" disabled={!signedIn || !sans.length} onClick={() => addToRepertoire("black")}>
              <Plus className="size-4" /> {t("lab.explorer.addBlack")}
            </Button>
          </div>
          {!signedIn ? (
            <p className="mt-2 text-2xs text-muted-foreground">{t("lab.signInHint")}</p>
          ) : null}
          {notice ? <p className="mt-2 text-xs text-primary">{notice}</p> : null}
        </div>

        <GamePanel title={t("lab.explorer.filters")} bodyClassName="p-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["masters", "lichess"] as const).map((source) => (
              <Button
                key={source}
                size="sm"
                variant={filters.source === source ? "default" : "outline"}
                onClick={() => setFilters((f) => ({ ...f, source }))}
              >
                {t(source === "masters" ? "lab.explorer.masters" : "lab.explorer.allPlayers")}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("size-4", loading && "animate-spin")} /> {t("lab.explorer.refresh")}
            </Button>
          </div>
          {filters.source === "lichess" ? (
            <>
              <div>
                <p className="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">
                  {t("lab.explorer.timeControl")}
                </p>
                <div className="flex flex-wrap gap-1">
                  {EXPLORER_SPEEDS.map((speed) => (
                    <Button
                      key={speed}
                      size="sm"
                      variant={filters.speeds.includes(speed) ? "default" : "outline"}
                      onClick={() =>
                        setFilters((f) => ({ ...f, speeds: toggle(f.speeds, speed) as ExplorerSpeed[] }))
                      }
                    >
                      {speed}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">
                  {t("lab.explorer.ratingRange")}
                </p>
                <div className="flex flex-wrap gap-1">
                  {EXPLORER_RATINGS.map((rating) => (
                    <Button
                      key={rating}
                      size="sm"
                      variant={filters.ratings.includes(rating) ? "default" : "outline"}
                      onClick={() =>
                        setFilters((f) => ({ ...f, ratings: toggle(f.ratings, rating) as ExplorerRating[] }))
                      }
                    >
                      {rating}+
                    </Button>
                  ))}
                </div>
              </div>
            </>
          ) : null}
          <div>
            <p className="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">
              {t("lab.explorer.since")}
            </p>
            <div className="flex flex-wrap gap-1">
              {YEARS.map((year) => (
                <Button
                  key={year}
                  size="sm"
                  variant={filters.sinceYear === year ? "default" : "outline"}
                  onClick={() => setFilters((f) => ({ ...f, sinceYear: year }))}
                >
                  {year}
                </Button>
              ))}
            </div>
          </div>
        </GamePanel>
      </div>

      <div className="space-y-3">
        <GamePanel
          title={t("lab.explorer.position")}
          meta={
            <span className="text-2xs text-muted-foreground">
              {data?.eco ? `${data.eco} · ` : ""}
              {data?.openingName ?? t("study.openings.startPosition")}
            </span>
          }
          bodyClassName="p-3"
        >
          <p className="px-1 font-mono text-xs break-words">
            {sans.length === 0 ? t("study.openings.startPosition") : pathLabel(sans)}
          </p>
          {data ? (
            <p className="mt-2 px-1 text-2xs text-muted-foreground">
              {t("lab.explorer.totals", {
                games: data.games.toLocaleString(),
                white: pct(data.games ? data.white / data.games : 0),
                draw: pct(data.games ? data.draws / data.games : 0),
                black: pct(data.games ? data.black / data.games : 0),
              })}{" "}
              · {t(`lab.explorer.origin.${data.origin}`)}
              {data.note ? ` · ${data.note}` : ""}
            </p>
          ) : null}
        </GamePanel>

        <GamePanel title={t("lab.explorer.moves")} bodyClassName="p-0">
          {error ? (
            <p className="p-3 text-xs text-destructive">{error}</p>
          ) : !data || data.moves.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              {loading ? t("lab.loading") : t("lab.explorer.noData")}
            </p>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 text-2xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">{t("lab.explorer.move")}</th>
                    <th className="px-2 py-1.5 text-right">{t("lab.explorer.games")}</th>
                    <th className="px-2 py-1.5 text-right">%</th>
                    <th className="px-2 py-1.5 text-right">{t("lab.explorer.rating")}</th>
                    <th className="px-2 py-1.5 text-left">W / D / B</th>
                  </tr>
                </thead>
                <tbody>
                  {data.moves.map((move) => (
                    <tr key={move.uci} className="border-t border-border/50 hover:bg-surface-2/60">
                      <td className="px-2 py-1.5">
                        <button type="button" className="text-left" onClick={() => push(move.san)}>
                          <span className="block font-mono font-semibold">{move.san}</span>
                          {move.openingName ? (
                            <span className="block max-w-[160px] truncate text-2xs text-muted-foreground">
                              {move.eco} {move.openingName}
                            </span>
                          ) : null}
                        </button>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">{move.games.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{pct(move.popularity)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{move.averageRating ?? "–"}</td>
                      <td className="px-2 py-1.5">
                        <span className="flex h-2 w-full min-w-[80px] overflow-hidden rounded-full bg-surface-2">
                          <span className="bg-foreground/80" style={{ width: pct(move.games ? move.white / move.games : 0) }} />
                          <span className="bg-muted-foreground/50" style={{ width: pct(move.games ? move.draws / move.games : 0) }} />
                          <span className="bg-primary/70" style={{ width: pct(move.games ? move.black / move.games : 0) }} />
                        </span>
                        <span className="mt-0.5 block font-mono text-2xs text-muted-foreground">
                          {pct(move.games ? move.white / move.games : 0)} /{" "}
                          {pct(move.games ? move.draws / move.games : 0)} /{" "}
                          {pct(move.games ? move.black / move.games : 0)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GamePanel>

        <GamePanel title={t("study.openings.engineLines")} bodyClassName="p-3">
          {lines.length === 0 ? (
            <p className="px-1 py-3 text-xs text-muted-foreground">
              {analysing ? t("study.openings.analysing") : t("study.openings.engineHint")}
            </p>
          ) : (
            <ul className="space-y-1">
              {lines.map((line, i) => (
                <li key={`${line.move}-${i}`} className="flex items-start justify-between gap-2 px-2 py-1.5">
                  <span className="min-w-0 font-mono text-xs break-words">
                    {pvToSan(fen, line.pv, 6).join(" ")}
                  </span>
                  <span className={cn("shrink-0 font-mono text-xs font-semibold", i === 0 ? "text-primary" : "text-muted-foreground")}>
                    {scoreLabel(line)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GamePanel>

        <p className="px-1 text-2xs text-muted-foreground">{t("lab.explorer.attribution")}</p>
      </div>
    </div>
  );
}
