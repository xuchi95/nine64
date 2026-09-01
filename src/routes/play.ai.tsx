import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cpu, Flag, Handshake, RefreshCw, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { MoveList } from "@/components/game/MoveList";
import { GamePanel, StatRow, EvalBar } from "@/components/game/GamePanel";
import { GameLayout, GameActions, GameNotice, StatusPill } from "@/components/game/GameLayout";
import { PlayerCard } from "@/components/game/PlayerCard";
import { ResultModal } from "@/components/game/ResultModal";
import { TimeControlPicker } from "@/components/game/TimeControlPicker";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { APP, type TimeControl } from "@/config/app";
import { BOT_LEVELS, BOT_PERSONALITIES, getBotLevel, getPersonality, botLevelTitle, personalityName, personalityBlurb } from "@/config/bots";
import { botVariants, type VariantId, variantName, variantBlurb } from "@/config/variants";
import { engineUciToAppMove } from "@/lib/chess/rules";
import { useChessGame, type Color } from "@/hooks/useChessGame";
import {
  StockfishEngine,
  humanThinkTime,
  type EngineLine,
} from "@/lib/engine/stockfish";
import { pickPersonalityMove, multiPvFor } from "@/lib/engine/personality";
import { playSound } from "@/lib/sound";
import { useSettings } from "@/lib/settings";
import { saveGame } from "@/lib/history";
import { detectOpening } from "@/lib/chess/openings";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BoardSkeleton } from "@/components/layout/PageSkeleton";
import { pageHead } from "@/lib/seo";
import { useServerFn } from "@tanstack/react-start";
import { getTitanStatus, startTitanSession, submitTitanMove, endTitanSession } from "@/lib/titan.functions";
import {
  createTitanStarter,
  titanMessage,
  titanStateMessage,
  titanStateOf,
  type TitanState,
} from "@/lib/engine/titanStart";
import { titanSupportsVariant } from "@/lib/engine/titanVariants";

import { createTitanSessionController } from "@/lib/engine/sessionLifecycle";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/play/ai")({
  validateSearch: (search: Record<string, unknown>): { quick?: boolean } =>
    search["quick"] === "1" || search["quick"] === true ? { quick: true } : {},

  head: () =>
    pageHead({
      path: "/play/ai",
      title: `Đấu với engine — ${APP.name}`,
      description:
        "Đối đầu Stockfish qua 15 mức được hiệu chỉnh, 7 tính cách bot và nhịp suy nghĩ giống người thật, chạy ngay trong trình duyệt.",
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
  const { t } = useT();
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
  // Level 16 (Titan) is a maximum-strength mode: personality is forced to
  // Oracle so the UI never claims a style the server does not honour.
  const titanLevel = level.runtime === "cloud";
  const personality = getPersonality(titanLevel ? "oracle" : config.personality);
  const botColor: Color = playerColor === "w" ? "b" : "w";

  const game = useChessGame({
    variant: config.variant,
    timeControl: config.timeControl,
    onGameEnd: (r, snapshot) => {
      setShowResult(true);
      if (r.winner === "draw") playSound("draw");
      else playSound(r.winner === playerColor ? "victory" : "defeat");
      if (snapshot.moves.length === 0) return;
      const botName = `${personalityName(personality.id)} · Lv ${level.level}`;
      const botSubtitle = `${botLevelTitle(level.level)} · ${level.strength}`;
      const saved = saveGame({
        mode: "ai",
        variant: config.variant,
        variantName: variantName(config.variant),
        timeControl: config.timeControl?.label ?? t("play.ai.standard"),
        startFen: snapshot.startFen,
        finalFen: snapshot.finalFen,
        moves: snapshot.moves,
        result: r,
        playerColor,
        white: playerColor === "w" ? { name: t("play.ai.you") } : { name: botName, subtitle: botSubtitle },
        black: playerColor === "b" ? { name: t("play.ai.you") } : { name: botName, subtitle: botSubtitle },
        opening: detectOpening(snapshot.moves.map((m) => m.san))?.name ?? null,
      });
      toast.success(t("play.ai.gameSaved"), {
        description: t("play.ai.gameSavedDesc"),
        action: {
          label: t("play.ai.viewAction"),
          onClick: () => void navigate({ to: "/games/$gameId", params: { gameId: saved.id } }),
        },
      });
    },
  });

  const engineRef = useRef<StockfishEngine | null>(null);
  const prevEval = useRef(0);
  const busy = useRef(false);

  // Titan (level 16) is server-authoritative: the browser never runs it.
  const isTitan = titanLevel;
  const startTitan = useServerFn(startTitanSession);
  const submitTitan = useServerFn(submitTitanMove);
  const endTitan = useServerFn(endTitanSession);
  const endTitanRef = useRef(endTitan);
  endTitanRef.current = endTitan;
  // Single owner of the current Titan session: every exit path closes it.
  const titanCtlRef = useRef<ReturnType<typeof createTitanSessionController> | null>(null);
  if (!titanCtlRef.current) {
    titanCtlRef.current = createTitanSessionController({
      end: async (sessionId, reason) => {
        await endTitanRef.current({ data: { sessionId, reason } });
      },
    });
  }
  const titanCtl = titanCtlRef.current;
  const [titanStarting, setTitanStarting] = useState(false);
  const titanStatusFn = useServerFn(getTitanStatus);
  const [titanState, setTitanState] = useState<TitanState>("loading");
  const [titanCode, setTitanCode] = useState<string | null>(null);
  const [titanProbe, setTitanProbe] = useState(0);
  // Titan runs plain Stockfish: variants it cannot adjudicate are blocked,
  // never silently downgraded to standard chess.
  const titanVariantBlocked = isTitan && !titanSupportsVariant(config.variant);


  // Preflight the Titan service so the setup screen can explain the state
  // before the player presses Start. Status probes may be retried safely.
  useEffect(() => {
    if (!isTitan || phase !== "setup") return;
    let cancelled = false;
    setTitanState("loading");
    void (async () => {
      try {
        const res = await titanStatusFn();
        if (!cancelled) {
          setTitanState(titanStateOf(res));
          setTitanCode(res.code ?? null);
        }
      } catch {
        if (!cancelled) {
          setTitanState("unavailable");
          setTitanCode("ENGINE_UNAVAILABLE");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTitan, phase, titanProbe]);


  type TitanSnapshot = Extract<Awaited<ReturnType<typeof startTitan>>, { ok: true }>["snapshot"];

  useEffect(() => {
    if (phase !== "playing" || isTitan) return;
    const engine = new StockfishEngine(settings.enginePerformance);
    engineRef.current = engine;
    engine.init().catch((e: Error) => setEngineError(e.message));
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, settings.enginePerformance, isTitan]);

  // Latest-value bridge so the single-flight starter can stay stable.
  const titanStartRef = useRef<{
    request: () => Promise<Awaited<ReturnType<typeof startTitan>>>;
    onStarted: (snapshot: TitanSnapshot) => void;
    onError: (code: string | null) => void;
  }>({
    request: () => Promise.reject(new Error("not ready")),
    onStarted: () => {},
    onError: () => {},
  });
  const titanStarterRef = useRef<(() => Promise<boolean>) | null>(null);
  if (!titanStarterRef.current) {
    titanStarterRef.current = createTitanStarter<TitanSnapshot>({
      request: () => titanStartRef.current.request(),
      onStarted: (snapshot) => titanStartRef.current.onStarted(snapshot),
      onError: (code) => titanStartRef.current.onError(code),
      onPending: setTitanStarting,
    });
  }

  const start = () => {
    const color: Color =
      config.color === "random" ? (Math.random() < 0.5 ? "w" : "b") : config.color;
    // Always clear the previous error before a new attempt.
    setEngineError(null);
    if (isTitan) {
      // Never silently convert an unsupported variant into standard chess.
      if (!titanSupportsVariant(config.variant)) {
        setEngineError(t("play.ai.titanVariantBlocked", { variant: variantName(config.variant) }));
        return;
      }
      const titanVariant = config.variant;
      // A Titan game only exists once the server has created the session.
      titanStartRef.current = {
        request: async () => {
          // Rematch / retry: close any previous session before asking the
          // server for a brand new one (fresh id, version and 960 position).
          await titanCtl.closeAndClear("abort");
          return startTitan({
            data: {
              playerColor: color,
              variant: titanVariant,
            },
          });
        },

        onStarted: (snapshot) => {
          titanCtl.set({ id: snapshot.sessionId, version: snapshot.version });
          setPlayerColor(color);
          setPremove(null);
          setShowResult(false);
          setEngineInfo(null);
          // The server owns the starting array (critical for Chess960).
          game.loadFen(snapshot.initialFen);
          prevEval.current = 0;
          setPhase("playing");
          playSound("matchFound");
          // Engine opened the game when the player is Black.
          for (const move of snapshot.moves) {
            game.makeMove(move.uci.slice(0, 2), move.uci.slice(2, 4), move.uci[4] as never);
          }
        },
        onError: (code) => {
          if (code === "VARIANT_NOT_SUPPORTED") {
            setEngineError(t("play.ai.titanVariantBlocked", { variant: variantName(config.variant) }));
            return;
          }
          setEngineError(titanMessage(code, t));
          setTitanProbe((n) => n + 1);
        },

      };
      // Session creation is single-flight and never auto-retried.
      void titanStarterRef.current?.();
      return;
    }
    titanCtl.clear();
    setPlayerColor(color);
    game.reset();
    prevEval.current = 0;
    setPhase("playing");
    playSound("matchFound");
  };


  /**
   * Titan rematch is a brand new server session (new id + version), never a
   * local board reset on top of a stale session.
   */
  const rematch = () => {
    setPremove(null);
    setShowResult(false);
    setEngineError(null);
    if (isTitan) {
      game.reset();
      start();
      return;
    }
    game.reset();
  };

  /** Leaving to setup must not strand an active Titan session. */
  const newSetup = () => {
    void titanCtl.closeAndClear("abort");
    setPremove(null);
    setShowResult(false);
    setEngineError(null);
    setEngineInfo(null);
    setThinking(false);
    setPhase("setup");
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
    if (busy.current) return;

    if (isTitan) {
      const session = titanCtl.get();
      const last = game.moves[game.moves.length - 1];
      if (!session || !last) return;
      let titanCancelled = false;
      busy.current = true;
      setThinking(true);
      const promo = /=([QRBN])/.exec(last.san)?.[1]?.toLowerCase();
      const uciMove = `${last.from}${last.to}${promo ?? ""}`;
      void (async () => {
        try {
          const res = await submitTitan({
            data: {
              sessionId: session.id,
              expectedVersion: session.version,
              uci: uciMove,
              idempotencyKey: `${session.id}:${session.version}`,
              clock: config.timeControl
                ? {
                    whiteMs: Math.round(game.clock.w * 1000),
                    blackMs: Math.round(game.clock.b * 1000),
                    whiteIncMs: (config.timeControl.increment ?? 0) * 1000,
                    blackIncMs: (config.timeControl.increment ?? 0) * 1000,
                  }
                : null,
            },
          });
          if (titanCancelled) return;
          if (!res.ok) {
            // Never silently downgrade to a weaker engine.
            setEngineError(titanMessage(res.code, t));
            return;
          }
          if (res.snapshot.status === "active") {
            titanCtl.set({ id: session.id, version: res.snapshot.version });
          } else {
            // Server already committed the terminal state — no second close.
            titanCtl.clear();
          }
          setEngineError(null);
          if (res.snapshot.engine?.depth) {
            setEngineInfo({ depth: res.snapshot.engine.depth, eval: "" });
          }
          // Apply whatever the canonical snapshot has beyond the local board.
          const pending = res.snapshot.moves.slice(game.moves.length);
          for (const move of pending) {
            game.makeMove(move.uci.slice(0, 2), move.uci.slice(2, 4), move.uci[4] as never);
          }
          applyPremove();
        } catch (err) {
          if (!titanCancelled) {
            setEngineError(err instanceof Error ? err.message : titanMessage(null, t));
          }
        } finally {
          busy.current = false;
          setThinking(false);
        }
      })();
      return () => {
        titanCancelled = true;
        busy.current = false;
        setThinking(false);
      };
    }

    const engine = engineRef.current;
    if (!engine || busy.current) return;

    let cancelled = false;
    busy.current = true;
    setThinking(true);

    const run = async () => {
      const startedAt = Date.now();
      const legal = game.legalMoveCount();
      const multiPv = multiPvFor(personality, level);
      let lines: EngineLine[] = [];
      try {
        lines = await engine.search({
          fen: game.fen,
          variant: config.variant === "chess960" ? "chess960" : "standard",
          depth: level.depth,
          moveTimeMs: level.moveTimeMs,
          multiPv,
          skill: level.skill,
          uciElo: level.uciElo,
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

      const uci = pickPersonalityMove({
        lines,
        personality,
        level,
        fen: game.fen,
        ply: game.moves.length,
        variant: config.variant === "chess960" ? "chess960" : "standard",
      });
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

      // Stockfish speaks UCI_Chess960 (king takes rook) for 960 castles; the
      // app speaks king -> final king square. Convert at the boundary only.
      const decoded =
        config.variant === "chess960" ? engineUciToAppMove(game.fen, uci) : null;
      if (config.variant === "chess960" && !decoded) {
        setEngineError("CHESS960_MOVE_DECODE_FAILED");
        busy.current = false;
        setThinking(false);
        return;
      }
      const from = decoded ? decoded.from : uci.slice(0, 2);
      const to = decoded ? decoded.to : uci.slice(2, 4);
      const promoRaw = decoded ? decoded.promotion : uci.length > 4 ? uci[4] : undefined;
      const promo = promoRaw as "q" | "r" | "b" | "n" | undefined;
      if (!game.makeMove(from, to, promo)) {
        setEngineError("CHESS960_ENGINE_ILLEGAL_MOVE");
      }
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
  }, [phase, game.fen, game.turn, game.result, botColor, level, personality, isTitan]);

  const canMoveFrom = useCallback(
    (square: string) => {
      if (game.result) return false;
      const piece = game.pieceAt(square);
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
        <h1 className="text-2xl font-bold">{t("play.ai.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {level.runtime === "cloud" ? t("play.ai.subtitleCloud") : t("play.ai.subtitle")}
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="panel p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("play.ai.strength")}
            </h2>
            <div className="mt-4 flex items-baseline justify-between">
              <div>
                <p className="font-display text-xl font-bold">
                  {t("play.ai.levelLabel", { level: level.level, title: botLevelTitle(level.level) })}
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
              <span>{t("play.ai.sliderBeginner")}</span>
              <span>{t("play.ai.sliderMax")}</span>
            </div>

            <h2 className="mt-7 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("play.ai.personality")}
            </h2>
            {isTitan && (
              <div className="mt-3">
                <GameNotice tone="warning">{t("play.ai.titanPersonalityLocked")}</GameNotice>
              </div>
            )}
            <div className={cn("mt-3 grid gap-2 sm:grid-cols-2", isTitan && "opacity-50")}>
              {BOT_PERSONALITIES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={isTitan}
                  onClick={() => setConfig((c) => ({ ...c, personality: p.id }))}
                  className={cn(
                    "rounded-md border p-3 text-left transition-colors",
                    isTitan && "cursor-not-allowed",
                    personality.id === p.id
                      ? "border-primary/60 bg-primary/10"
                      : "border-border bg-surface-2 hover:border-primary/40",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {personalityName(p.id)}
                    <span className="rounded bg-accent/20 px-1.5 py-0.5 text-2xs font-bold tracking-wider text-accent">
                      {t("play.ai.botBadge")}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{personalityBlurb(p.id)}</span>
                </button>
              ))}
            </div>

            <h2 className="mt-7 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("play.ai.yourColor")}
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
                  {c === "w" ? t("play.ai.colorWhite") : c === "b" ? t("play.ai.colorBlack") : t("play.ai.colorRandom")}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="panel p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t("play.ai.variant")}
              </h2>
              <div className="mt-3 grid gap-2">
                {botVariants().map((v) => {
                  const blockedForTitan = isTitan && !titanSupportsVariant(v.id);
                  const selected = config.variant === v.id;
                  return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, variant: v.id }))}
                    aria-disabled={blockedForTitan}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      selected && blockedForTitan
                        ? "border-destructive/70 bg-destructive/10"
                        : selected
                          ? "border-primary/60 bg-primary/10"
                          : "border-border bg-surface-2 hover:border-primary/40",
                      blockedForTitan && !selected && "opacity-50",
                    )}
                  >
                    <span className="font-medium">{variantName(v.id)}</span>
                    {blockedForTitan && (
                      <span className="ml-2 rounded border border-destructive/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-destructive">
                        {t("play.ai.titanVariantUnsupportedBadge")}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-muted-foreground">{variantBlurb(v.id)}</span>

                  </button>
                  );
                })}
              </div>
              {titanVariantBlocked && (
                <div className="mt-3">
                  <GameNotice tone="error">
                    {t("play.ai.titanVariantBlocked", { variant: variantName(config.variant) })}
                  </GameNotice>
                </div>
              )}

              {isTitan && !titanVariantBlocked && (
                <p className="mt-3 text-xs text-muted-foreground">{t("play.ai.titanVariantHint")}</p>
              )}
            </div>

            <div className="panel p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t("play.ai.timeControl")}
              </h2>
              <TimeControlPicker
                value={config.timeControl}
                onChange={(tc) => setConfig((c) => ({ ...c, timeControl: tc }))}
              />
            </div>
            {isTitan && (
              <div className="panel space-y-2 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("play.ai.titanStatusTitle")}
                  </h2>
                  {titanState === "loading" ? (
                    <StatusPill tone="neutral">{t("play.ai.titanChecking")}</StatusPill>
                  ) : titanState === "ready" ? (
                    <StatusPill tone="live">{t("play.ai.titanReady")}</StatusPill>
                  ) : null}
                </div>
                {titanStateMessage(titanState, t, titanCode) && (
                  <GameNotice tone={titanState === "unavailable" ? "warning" : "error"}>
                    {titanStateMessage(titanState, t, titanCode)}
                  </GameNotice>
                )}
                {titanState === "unavailable" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTitanProbe((n) => n + 1)}
                  >
                    <RefreshCw className="size-4" />
                    {t("play.ai.titanRetry")}
                  </Button>
                )}
              </div>
            )}
            {engineError && <GameNotice tone="error">{engineError}</GameNotice>}
            <Button
              size="lg"
              className="w-full"
              onClick={start}
              disabled={titanStarting || titanVariantBlocked || (isTitan && titanState !== "ready")}
            >

              {titanStarting ? t("play.ai.titanStarting") : t("play.ai.startGame")}
            </Button>

          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      <GameLayout
        left={
          <>
          <PlayerCard
            player={{
              name: personalityName(personality.id),
              subtitle: t("play.ai.playerLevel", { level: level.level, title: botLevelTitle(level.level), strength: level.strength }),
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
            player={{ name: t("play.ai.you"), subtitle: playerColor === "w" ? t("play.ai.colorWhite") : t("play.ai.colorBlack"), color: playerColor }}
            seconds={game.clock[playerColor]}
            active={game.turn === playerColor && !game.result}
            clockEnabled={!!config.timeControl}
            captured={game.captured[botColor]}
          />
          <GamePanel
            title={t("play.ai.gameStatus")}
            meta={
              <StatusPill tone={game.result ? "neutral" : "live"}>
                {game.result ? t("play.ai.finished") : t("play.ai.live")}
              </StatusPill>
            }
            bodyClassName="space-y-3.5 p-4"
          >
            <StatRow label={t("play.ai.variantLabel")} value={variantName(config.variant)} />
            <StatRow label={t("play.ai.openingLabel")} value={game.opening?.name ?? "—"} />
            <StatRow label={t("play.ai.engineDepth")} value={engineInfo ? String(engineInfo.depth) : "—"} mono />
            <EvalBar
              score={engineInfo?.eval ? Number.parseFloat(engineInfo.eval) || 0 : null}
              label={engineInfo?.eval ?? "—"}
            />
            {capability && (
              <StatRow
                label={t("play.ai.engineSetup")}
                value={`${capability.threads}T · ${capability.hashMb}MB${capability.threaded ? "" : " · single"}`}
                mono
              />
            )}
          </GamePanel>
          {engineError && (
            <GameNotice tone="error">{t("play.ai.engineUnavailable", { error: engineError })}</GameNotice>
          )}
          </>
        }
        board={
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
        }
        right={
          <>
          <GamePanel
            title={t("play.ai.notation")}
            meta={game.moves.length > 0 ? t("play.ai.move", { n: Math.ceil(game.moves.length / 2) }) : undefined}
            className="max-h-[420px]"
            bodyClassName="overflow-hidden"
          >
            <MoveList moves={game.moves} />
          </GamePanel>
          <div className="space-y-2">
            <GameActions>
              <Button
                variant="outline"
                onClick={() => {
                  if (!settings.confirmResign || window.confirm(t("play.ai.resignConfirm"))) {
                    game.resign(playerColor);
                    void titanCtl.closeAndClear("resign");
                  }
                }}
                disabled={!!game.result}
              >
                <Flag className="size-4" /> {t("play.ai.resign")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  game.declareDraw("Agreement");
                  void titanCtl.closeAndClear("draw");
                }}
                disabled={!!game.result}
              >
                <Handshake className="size-4" /> {t("play.ai.draw")}
              </Button>
            </GameActions>
            <Button
              className="w-full"
              size="lg"
              onClick={rematch}
              disabled={isTitan && titanStarting}
            >
              <RefreshCw className="size-4" /> {t("play.ai.rematch")}
            </Button>
            {game.result && (
              <Button variant="secondary" className="w-full" onClick={() => setShowResult(true)}>
                {t("play.ai.viewResult")}
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground"
              onClick={newSetup}
            >
              <RotateCcw className="size-4" /> {t("play.ai.newSetup")}
            </Button>
          </div>
          </>
        }
      />

      <ResultModal
        result={game.result}
        playerColor={playerColor}
        open={showResult}
        onOpenChange={setShowResult}
        onRematch={rematch}
        onNewGame={() => {
          setShowResult(false);
          newSetup();
        }}
        onAnalyse={() => navigate({ to: "/analysis", search: { fen: game.fen } })}
      />
    </AppShell>
  );
}

