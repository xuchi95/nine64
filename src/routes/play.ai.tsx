import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cpu, Flag, Handshake, RefreshCw, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { MoveList } from "@/components/game/MoveList";
import { PlayerCard } from "@/components/game/PlayerCard";
import { ResultModal } from "@/components/game/ResultModal";
import { TimeControlPicker } from "@/components/game/TimeControlPicker";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { APP, type TimeControl } from "@/config/app";
import { BOT_LEVELS, BOT_PERSONALITIES, getBotLevel, getPersonality } from "@/config/bots";
import { VARIANTS, type VariantId } from "@/config/variants";
import { useChessGame, type Color } from "@/hooks/useChessGame";
import {
  StockfishEngine,
  humanThinkTime,
  pickMoveWithPersonality,
  type EngineLine,
} from "@/lib/engine/stockfish";
import { playSound } from "@/lib/sound";
import { useSettings } from "@/lib/settings";
import { saveGame } from "@/lib/history";
import { detectOpening } from "@/lib/chess/openings";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BoardSkeleton } from "@/components/layout/PageSkeleton";

export const Route = createFileRoute("/play/ai")({
  validateSearch: (search: Record<string, unknown>): { quick?: boolean } =>
    search["quick"] === "1" || search["quick"] === true ? { quick: true } : {},

  head: () => ({
    meta: [
      { title: `Play the engine — ${APP.name}` },
      {
        name: "description",
        content:
          "Face Stockfish across fifteen calibrated levels, from Beginner to Engine Max, with human-like thinking time and bot personalities.",
      },
      { property: "og:title", content: `Play the engine — ${APP.name}` },
      {
        property: "og:description",
        content: "Fifteen engine levels, seven personalities, running fully in your browser.",
      },
    ],
  }),
  pendingComponent: BoardSkeleton,
  component: PlayAi,
});


interface Config {
  level: number;
  personality: string;
  color: Color | "random";
  variant: VariantId;
  timeControl: TimeControl | null;
}

function PlayAi() {
  const navigate = useNavigate();
  const settings = useSettings();
  const [config, setConfig] = useState<Config>({
    level: 8,
    personality: "atlas",
    color: "w",
    variant: "standard",
    timeControl: null,
  });
  const [phase, setPhase] = useState<"setup" | "playing">("setup");
  const [playerColor, setPlayerColor] = useState<Color>("w");
  const [thinking, setThinking] = useState(false);
  const [engineInfo, setEngineInfo] = useState<{ depth: number; eval: string } | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [premove, setPremove] = useState<{ from: string; to: string } | null>(null);
  const [showResult, setShowResult] = useState(false);

  const level = getBotLevel(config.level);
  const personality = getPersonality(config.personality);
  const botColor: Color = playerColor === "w" ? "b" : "w";

  const game = useChessGame({
    variant: config.variant,
    timeControl: config.timeControl,
    onGameEnd: (r, snapshot) => {
      setShowResult(true);
      if (r.winner === "draw") playSound("draw");
      else playSound(r.winner === playerColor ? "victory" : "defeat");
      if (snapshot.moves.length === 0) return;
      const botName = `${personality.name} · Lv ${level.level}`;
      const botSubtitle = `${level.title} · ${level.strength}`;
      const saved = saveGame({
        mode: "ai",
        variant: config.variant,
        variantName: VARIANTS.find((v) => v.id === config.variant)?.name ?? config.variant,
        timeControl: config.timeControl?.label ?? "Unlimited",
        startFen: snapshot.startFen,
        finalFen: snapshot.finalFen,
        moves: snapshot.moves,
        result: r,
        playerColor,
        white: playerColor === "w" ? { name: "You" } : { name: botName, subtitle: botSubtitle },
        black: playerColor === "b" ? { name: "You" } : { name: botName, subtitle: botSubtitle },
        opening: detectOpening(snapshot.moves.map((m) => m.san))?.name ?? null,
      });
      toast.success("Game saved to your archive", {
        description: "Open it for a move-by-move replay and engine review.",
        action: {
          label: "View",
          onClick: () => void navigate({ to: "/games/$gameId", params: { gameId: saved.id } }),
        },
      });
    },
  });

  const engineRef = useRef<StockfishEngine | null>(null);
  const prevEval = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    if (phase !== "playing") return;
    const engine = new StockfishEngine(settings.enginePerformance);
    engineRef.current = engine;
    engine.init().catch((e: Error) => setEngineError(e.message));
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, settings.enginePerformance]);

  const start = () => {
    const color: Color =
      config.color === "random" ? (Math.random() < 0.5 ? "w" : "b") : config.color;
    setPlayerColor(color);
    game.reset();
    prevEval.current = 0;
    setPhase("playing");
    playSound("matchFound");
  };

  const { quick } = Route.useSearch();
  const quickStarted = useRef(false);
  useEffect(() => {
    if (!quick || quickStarted.current) return;
    quickStarted.current = true;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick]);



  const applyPremove = useCallback(() => {
    if (!premove) return;
    const ok = game.legalTargets(premove.from).includes(premove.to);
    setPremove(null);
    if (ok) game.makeMove(premove.from, premove.to);
  }, [game, premove]);

  // Bot turn: search off-thread, then hold the move for a human-like delay.
  useEffect(() => {
    if (phase !== "playing" || game.result || game.turn !== botColor) return;
    const engine = engineRef.current;
    if (!engine || busy.current) return;

    let cancelled = false;
    busy.current = true;
    setThinking(true);

    const run = async () => {
      const startedAt = Date.now();
      const legal = game.game.current.moves().length;
      const multiPv = personality.evalTolerance > 0 && level.level < 13 ? 4 : 1;
      let lines: EngineLine[] = [];
      try {
        lines = await engine.search({
          fen: game.fen,
          depth: level.depth,
          moveTimeMs: level.moveTimeMs,
          multiPv,
          skill: level.skill,
          uciElo: level.uciElo,
          contempt: personality.contempt,
        });
      } catch (e) {
        if (!cancelled) setEngineError((e as Error).message);
        busy.current = false;
        setThinking(false);
        return;
      }
      if (cancelled || lines.length === 0) {
        busy.current = false;
        setThinking(false);
        return;
      }

      const best = lines[0]!;
      const cp = best.mateIn !== null ? (best.mateIn > 0 ? 1200 : -1200) : (best.cp ?? 0);
      setEngineInfo({
        depth: best.depth,
        eval:
          best.mateIn !== null
            ? `M${Math.abs(best.mateIn)}`
            : `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)}`,
      });

      const uci = pickMoveWithPersonality(lines, personality, level);
      const swing = cp - prevEval.current;
      prevEval.current = cp;

      const delay = humanThinkTime({
        level,
        legalMoves: legal,
        moveNumber: game.moves.length + 1,
        evalSwingCp: swing,
        remainingMs: (config.timeControl ? game.clock[botColor] : 600) * 1000,
        baseTimeSec: config.timeControl?.initial ?? 900,
        isCritical: Math.abs(swing) > 150 || best.mateIn !== null,
      });
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, delay - elapsed);
      await new Promise((r) => setTimeout(r, wait));
      if (cancelled) {
        busy.current = false;
        return;
      }

      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promo = uci.length > 4 ? (uci[4] as "q" | "r" | "b" | "n") : undefined;
      game.makeMove(from, to, promo);
      busy.current = false;
      setThinking(false);
      applyPremove();
    };

    void run();
    return () => {
      cancelled = true;
      busy.current = false;
      setThinking(false);
      engineRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, game.fen, game.turn, game.result, botColor, level, personality]);

  const canMoveFrom = useCallback(
    (square: string) => {
      if (game.result) return false;
      const piece = game.game.current.get(square as never);
      return !!piece && piece.color === playerColor && game.turn === playerColor;
    },
    [game, playerColor],
  );

  const capability = useMemo(
    () => engineRef.current?.capability ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, thinking],
  );

  if (phase === "setup") {
    return (
      <AppShell>
        <h1 className="text-2xl font-bold">Play the engine</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stockfish 18 (WASM) runs in a web worker on your device — nothing leaves the browser.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="panel p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Strength
            </h2>
            <div className="mt-4 flex items-baseline justify-between">
              <div>
                <p className="font-display text-xl font-bold">
                  Level {level.level} — {level.title}
                </p>
                <p className="text-xs text-muted-foreground">{level.strength}</p>
              </div>
              <Cpu className="size-5 text-primary" />
            </div>
            <Slider
              className="mt-4"
              min={1}
              max={BOT_LEVELS.length}
              step={1}
              value={[config.level]}
              onValueChange={([v]) => setConfig((c) => ({ ...c, level: v ?? c.level }))}
            />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>Beginner</span>
              <span>Engine Max</span>
            </div>

            <h2 className="mt-7 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Personality
            </h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {BOT_PERSONALITIES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, personality: p.id }))}
                  className={cn(
                    "rounded-md border p-3 text-left transition-colors",
                    config.personality === p.id
                      ? "border-primary/60 bg-primary/10"
                      : "border-border bg-surface-2 hover:border-primary/40",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {p.name}
                    <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-accent">
                      BOT
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{p.blurb}</span>
                </button>
              ))}
            </div>

            <h2 className="mt-7 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Your colour
            </h2>
            <div className="mt-3 flex gap-2">
              {(["w", "b", "random"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setConfig((cfg) => ({ ...cfg, color: c }))}
                  className={cn(
                    "rounded-md border px-4 py-2 text-sm transition-colors",
                    config.color === c
                      ? "border-primary/60 bg-primary/15"
                      : "border-border bg-surface-2 hover:border-primary/40",
                  )}
                >
                  {c === "w" ? "White" : c === "b" ? "Black" : "Random"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="panel p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Variant
              </h2>
              <div className="mt-3 grid gap-2">
                {VARIANTS.filter((v) => v.enabled).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, variant: v.id }))}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      config.variant === v.id
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-surface-2 hover:border-primary/40",
                    )}
                  >
                    <span className="font-medium">{v.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{v.blurb}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="panel p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Time control
              </h2>
              <TimeControlPicker
                value={config.timeControl}
                onChange={(tc) => setConfig((c) => ({ ...c, timeControl: tc }))}
              />
            </div>
            <Button size="lg" className="w-full" onClick={start}>
              Start game
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        <div className="order-2 space-y-3 lg:order-1">
          <PlayerCard
            player={{
              name: `${personality.name}`,
              subtitle: `Level ${level.level} · ${level.title} · ${level.strength}`,
              isBot: true,
              color: botColor,
            }}
            seconds={game.clock[botColor]}
            active={game.turn === botColor && !game.result}
            clockEnabled={!!config.timeControl}
            captured={game.captured[playerColor]}
            thinking={thinking}
          />
          <PlayerCard
            player={{ name: "You", subtitle: playerColor === "w" ? "White" : "Black", color: playerColor }}
            seconds={game.clock[playerColor]}
            active={game.turn === playerColor && !game.result}
            clockEnabled={!!config.timeControl}
            captured={game.captured[botColor]}
          />
          <GamePanel title="Game status" bodyClassName="space-y-3.5 p-4">
            <StatRow label="Variant" value={VARIANTS.find((v) => v.id === config.variant)!.name} />
            <StatRow label="Opening" value={game.opening?.name ?? "—"} />
            <StatRow label="Engine depth" value={engineInfo ? String(engineInfo.depth) : "—"} mono />
            <EvalBar
              score={engineInfo?.eval ? Number.parseFloat(engineInfo.eval) || 0 : null}
              label={engineInfo?.eval ?? "—"}
            />
            {capability && (
              <StatRow
                label="Engine setup"
                value={`${capability.threads}T · ${capability.hashMb}MB${capability.threaded ? "" : " · single"}`}
                mono
              />
            )}
          </GamePanel>
          {engineError && (
            <div className="panel border-destructive/60 p-4 text-sm text-destructive">
              Engine unavailable: {engineError}
            </div>
          )}
        </div>

        <div className="order-1 lg:order-2">
          <div className="mx-auto w-full max-w-[720px]">
            <ChessBoard
              pieces={game.board}
              orientation={playerColor}
              legalTargets={game.legalTargets}
              canMoveFrom={canMoveFrom}
              onMove={(from, to, promo) => game.makeMove(from, to, promo)}
              needsPromotion={game.needsPromotion}
              lastMove={game.lastMove}
              checkSquare={game.checkSquare}
              checkmate={game.result?.reason === "Checkmate"}
              interactive={!game.result}
              turn={game.turn}
              premove={premove}
              onPremove={(from, to) => setPremove({ from, to })}
            />
          </div>
        </div>

        <div className="order-3 space-y-4">
          <GamePanel
            title="Notation"
            meta={game.moves.length > 0 ? `Move ${Math.ceil(game.moves.length / 2)}` : undefined}
            className="max-h-[420px]"
            bodyClassName="overflow-hidden"
          >
            <MoveList moves={game.moves} />
          </GamePanel>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (!settings.confirmResign || window.confirm("Resign this game?")) {
                    game.resign(playerColor);
                  }
                }}
                disabled={!!game.result}
              >
                <Flag className="size-4" /> Resign
              </Button>
              <Button
                variant="outline"
                onClick={() => game.declareDraw("Agreement")}
                disabled={!!game.result}
              >
                <Handshake className="size-4" /> Draw
              </Button>
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={() => {
                game.reset();
                setPremove(null);
                setShowResult(false);
              }}
            >
              <RefreshCw className="size-4" /> Rematch
            </Button>
            {game.result && (
              <Button variant="secondary" className="w-full" onClick={() => setShowResult(true)}>
                View result
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full text-[0.7rem] font-bold uppercase tracking-[0.16em] text-muted-foreground"
              onClick={() => setPhase("setup")}
            >
              <RotateCcw className="size-4" /> New setup
            </Button>
          </div>
        </div>
      </div>

      <ResultModal
        result={game.result}
        playerColor={playerColor}
        open={showResult}
        onOpenChange={setShowResult}
        onRematch={() => {
          game.reset();
          setPremove(null);
          setShowResult(false);
        }}
        onNewGame={() => {
          setShowResult(false);
          setPhase("setup");
        }}
        onAnalyse={() => navigate({ to: "/analysis", search: { fen: game.fen } })}
      />
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  );
}
