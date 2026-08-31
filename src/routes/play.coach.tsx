/**
 * /play/coach — coached practice against a bot.
 *
 * Training only: this mode is never available in ranked online play. Every
 * chess claim shown here comes from the rules engine (legal moves, SAN) and
 * Stockfish (best move, evaluation). The AI layer may only rephrase the
 * already-computed explanation, and a failure there silently falls back to the
 * deterministic text.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Flag, GraduationCap, RefreshCw, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { MoveList } from "@/components/game/MoveList";
import { GamePanel, StatRow } from "@/components/game/GamePanel";
import { GameLayout, GameActions, GameNotice, StatusPill } from "@/components/game/GameLayout";
import { PlayerCard } from "@/components/game/PlayerCard";
import { CoachPanel, type CoachSourceBadge } from "@/components/game/CoachPanel";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { APP } from "@/config/app";
import { BOT_LEVELS, botLevelTitle, getBotLevel } from "@/config/bots";
import { useChessGame, type Color } from "@/hooks/useChessGame";
import { StockfishEngine, type EngineLine } from "@/lib/engine/stockfish";
import { classifyMove, passesCadence, type CadenceState } from "@/lib/coach/live/detect";
import { buildMoveFacts } from "@/lib/coach/live/facts";
import { PERSONALITIES, buildMoment } from "@/lib/coach/live/present";
import {
  COACH_MODES,
  COACH_PERSONALITIES,
  type CoachMode,
  type CoachMoment,
  type CoachPersonalityId,
} from "@/lib/coach/live/types";
import { logLiveCoachEvent, styleLiveCoachMoment } from "@/lib/coachLive.functions";
import { useSettings } from "@/lib/settings";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { BoardSkeleton } from "@/components/layout/PageSkeleton";
import { pageHead } from "@/lib/seo";
import { useServerFn } from "@tanstack/react-start";
import { useLocale, useT } from "@/lib/i18n";

export const Route = createFileRoute("/play/coach")({
  head: () =>
    pageHead({
      path: "/play/coach",
      title: `Chơi cùng Huấn luyện viên — ${APP.name}`,
      description:
        "Chế độ luyện tập có huấn luyện viên trực tiếp: engine chấm từng nước, coach chỉ nhắc khi bạn mắc lỗi lớn, bỏ lỡ đòn phối hợp hoặc vi phạm nguyên tắc khai cuộc.",
    }),
  pendingComponent: BoardSkeleton,
  component: PlayCoach,
});

/** Engine effort used for coaching verdicts — independent of the bot's level. */
const COACH_DEPTH = 14;
const COACH_MOVETIME_MS = 700;

function PlayCoach() {
  const { t } = useT();
  const locale = useLocale() === "en" ? "en" : "vi";
  const settings = useSettings();

  const [phase, setPhase] = useState<"setup" | "playing">("setup");
  const [botLevel, setBotLevel] = useState(6);
  const [mode, setMode] = useState<CoachMode>("normal");
  const [personality, setPersonality] = useState<CoachPersonalityId>("friendly_teacher");
  const [colorChoice, setColorChoice] = useState<Color | "random">("w");
  const [playerColor, setPlayerColor] = useState<Color>("w");
  const [thinking, setThinking] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);

  const [moment, setMoment] = useState<CoachMoment | null>(null);
  const [history, setHistory] = useState<CoachMoment[]>([]);
  const [source, setSource] = useState<CoachSourceBadge>("engine");
  const [showArrow, setShowArrow] = useState(false);

  const level = getBotLevel(botLevel);
  const botColor: Color = playerColor === "w" ? "b" : "w";

  const game = useChessGame({ variant: "standard", timeControl: null });
  const engineRef = useRef<StockfishEngine | null>(null);
  const busy = useRef(false);
  const cadence = useRef<CadenceState>({ lastPlyIndex: null, shown: 0 });
  const gameIdRef = useRef<string>("");
  const lastCoachedPly = useRef(-1);

  const styleMoment = useServerFn(styleLiveCoachMoment);
  const logMoment = useServerFn(logLiveCoachEvent);

  // Browser engine only: coached practice never spends Cloud engine budget.
  useEffect(() => {
    if (phase !== "playing") return;
    const engine = new StockfishEngine(settings.enginePerformance);
    engineRef.current = engine;
    engine.init().catch((e: Error) => setEngineError(e.message));
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [phase, settings.enginePerformance]);

  const start = () => {
    const color: Color =
      colorChoice === "random" ? (Math.random() < 0.5 ? "w" : "b") : colorChoice;
    setPlayerColor(color);
    game.reset();
    cadence.current = { lastPlyIndex: null, shown: 0 };
    lastCoachedPly.current = -1;
    gameIdRef.current = `coach-${Date.now().toString(36)}`;
    setMoment(null);
    setHistory([]);
    setShowArrow(false);
    setEngineError(null);
    setPhase("playing");
    playSound("matchFound");
  };

  /** Grades the user's last move and, if warranted, produces one moment. */
  const coachLastMove = useCallback(async () => {
    const engine = engineRef.current;
    const plyIndex = game.moves.length - 1;
    const played = game.moves[plyIndex];
    if (!engine || !played || played.color !== playerColor) return;
    if (lastCoachedPly.current >= plyIndex) return;
    lastCoachedPly.current = plyIndex;

    const beforeFen = plyIndex === 0 ? game.startFen : game.moves[plyIndex - 1]!.fen;
    const afterFen = played.fen;

    setAnalysing(true);
    let before: EngineLine[] = [];
    let after: EngineLine[] = [];
    try {
      before = await engine.search({
        fen: beforeFen,
        variant: "standard",
        depth: COACH_DEPTH,
        moveTimeMs: COACH_MOVETIME_MS,
        multiPv: 1,
      });
      after = await engine.search({
        fen: afterFen,
        variant: "standard",
        depth: COACH_DEPTH,
        moveTimeMs: COACH_MOVETIME_MS,
        multiPv: 1,
      });
    } catch (e) {
      setEngineError((e as Error).message);
      setAnalysing(false);
      return;
    }
    setAnalysing(false);

    const b = before[0];
    const a = after[0];
    if (!b || !a) return;

    // Stockfish scores from the side to move; convert both to the user's view.
    const toCp = (line: EngineLine, sign: number) =>
      sign * (line.mateIn !== null ? (line.mateIn > 0 ? 1500 : -1500) : (line.cp ?? 0));

    const facts = buildMoveFacts({
      variant: "standard",
      userColor: playerColor,
      beforeFen,
      afterFen,
      playedSan: played.san,
      plyIndex,
      moveNumber: Math.floor(plyIndex / 2) + 1,
      bestUci: b.move || null,
      evalBeforeCp: toCp(b, 1),
      evalAfterCp: toCp(a, -1),
      mateBefore: b.mateIn !== null && b.mateIn > 0 ? b.mateIn : null,
      mateAgainst: a.mateIn !== null && a.mateIn > 0 ? a.mateIn : null,
      history: game.moves.map((m) => ({ san: m.san, from: m.from, to: m.to, color: m.color })),
    });

    const decision = classifyMove(facts, mode);
    if (!decision || !passesCadence(decision, cadence.current, plyIndex)) return;

    const built = buildMoment(decision, facts, { mode, personality, locale });
    cadence.current = { lastPlyIndex: plyIndex, shown: cadence.current.shown + 1 };
    setShowArrow(false);
    setMoment(built);
    setSource("engine");
    setHistory((prev) => [...prev, built]);

    // Optional AI restyling — purely cosmetic, never blocking.
    let aiStyled = false;
    try {
      const res = await styleMoment({
        data: {
          locale,
          personality,
          mode,
          kind: built.kind,
          playedSan: built.playedSan,
          bestSan: built.bestSan,
          lossCp: Math.round(built.lossCp),
          baseMessage: built.message,
          baseQuestion: built.question,
        },
      });
      if (res.styled) {
        aiStyled = true;
        const styled = { ...built, message: res.styled.message, question: res.styled.question ?? built.question };
        setMoment((cur) => (cur?.id === built.id ? styled : cur));
        setHistory((prev) => prev.map((m) => (m.id === built.id ? styled : m)));
        setSource("ai");
      } else {
        setSource(res.reason === "quota" ? "quota" : "engine");
      }
    } catch {
      setSource("engine");
    }

    // Skill Graph signal: what the user keeps getting wrong.
    try {
      await logMoment({
        data: {
          localGameId: gameIdRef.current,
          plyIndex,
          moveNumber: built.moveNumber,
          kind: built.kind,
          severity: built.severity,
          skillKey: built.skillKey,
          lossCp: Math.round(built.lossCp),
          mode,
          personality,
          aiStyled,
          retried: false,
        },
      });
    } catch {
      // Signed-out practice still works; tracking is best-effort.
    }
  }, [game, locale, logMoment, mode, personality, playerColor, styleMoment]);

  // Coach the user's move as soon as it lands.
  useEffect(() => {
    if (phase !== "playing" || game.result) return;
    const last = game.moves[game.moves.length - 1];
    if (!last || last.color !== playerColor) return;
    void coachLastMove();
  }, [phase, game.moves.length, game.result, playerColor, coachLastMove, game.moves]);

  // Bot reply.
  useEffect(() => {
    if (phase !== "playing" || game.result || game.turn !== botColor) return;
    const engine = engineRef.current;
    if (!engine || busy.current) return;
    let cancelled = false;
    busy.current = true;
    setThinking(true);

    void (async () => {
      try {
        const lines = await engine.search({
          fen: game.fen,
          variant: "standard",
          depth: level.depth,
          moveTimeMs: level.moveTimeMs,
          multiPv: 1,
          skill: level.skill,
          uciElo: level.uciElo,
        });
        const uci = lines[0]?.move;
        if (cancelled || !uci) return;
        game.makeMove(uci.slice(0, 2), uci.slice(2, 4), uci[4] as never);
      } catch (e) {
        if (!cancelled) setEngineError((e as Error).message);
      } finally {
        busy.current = false;
        setThinking(false);
      }
    })();

    return () => {
      cancelled = true;
      busy.current = false;
      setThinking(false);
      engineRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, game.fen, game.turn, game.result, botColor, level]);

  /** Rewinds to just before the coached move so the user can play it again. */
  const retry = useCallback(() => {
    if (!moment) return;
    const plies = game.moves.length - moment.plyIndex;
    if (!game.takeback(plies)) return;
    lastCoachedPly.current = moment.plyIndex - 1;
    setMoment(null);
    setShowArrow(false);
  }, [game, moment]);

  const canMoveFrom = useCallback(
    (square: string) => {
      if (game.result) return false;
      const piece = game.pieceAt(square);
      return !!piece && piece.color === playerColor && game.turn === playerColor;
    },
    [game, playerColor],
  );

  if (phase === "setup") {
    return (
      <AppShell>
        <h1 className="text-2xl font-bold">{t("coachLive.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("coachLive.subtitle")}</p>
        <GameNotice tone="info">{t("coachLive.notRanked")}</GameNotice>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="panel p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("coachLive.mode")}
            </h2>
            <div className="mt-3 grid gap-2">
              {COACH_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-md border p-3 text-left transition-colors",
                    mode === m
                      ? "border-primary/60 bg-primary/10"
                      : "border-border bg-surface-2 hover:border-primary/40",
                  )}
                >
                  <span className="text-sm font-semibold">{t(`coachLive.mode.${m}`)}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t(`coachLive.mode.${m}.desc`)}
                  </span>
                </button>
              ))}
            </div>

            <h2 className="mt-7 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("coachLive.personality")}
            </h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {COACH_PERSONALITIES.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPersonality(id)}
                  className={cn(
                    "rounded-md border p-3 text-left transition-colors",
                    personality === id
                      ? "border-primary/60 bg-primary/10"
                      : "border-border bg-surface-2 hover:border-primary/40",
                  )}
                >
                  <span className="text-sm font-semibold">{PERSONALITIES[id].name[locale]}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {PERSONALITIES[id].blurb[locale]}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t("coachLive.personalityNote")}</p>
          </div>

          <div className="space-y-4">
            <div className="panel p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t("coachLive.strength")}
              </h2>
              <p className="mt-3 font-display text-lg font-bold">
                Lv {level.level} · {botLevelTitle(level.level)}
              </p>
              <p className="text-xs text-muted-foreground">{level.strength}</p>
              <Slider
                className="mt-4"
                min={1}
                max={BOT_LEVELS.filter((b) => b.runtime !== "cloud").length}
                step={1}
                value={[botLevel]}
                onValueChange={([v]) => setBotLevel(v ?? botLevel)}
              />
            </div>
            <div className="panel p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t("coachLive.color")}
              </h2>
              <div className="mt-3 flex gap-2">
                {(["w", "b", "random"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColorChoice(c)}
                    className={cn(
                      "rounded-md border px-4 py-2 text-sm transition-colors",
                      colorChoice === c
                        ? "border-primary/60 bg-primary/15"
                        : "border-border bg-surface-2 hover:border-primary/40",
                    )}
                  >
                    {c === "w"
                      ? t("coachLive.colorWhite")
                      : c === "b"
                        ? t("coachLive.colorBlack")
                        : t("coachLive.colorRandom")}
                  </button>
                ))}
              </div>
            </div>
            <Button size="lg" className="w-full" onClick={start}>
              <GraduationCap className="size-4" /> {t("coachLive.start")}
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
                name: `Lv ${level.level} · ${botLevelTitle(level.level)}`,
                subtitle: level.strength,
                isBot: true,
                color: botColor,
              }}
              seconds={0}
              active={game.turn === botColor && !game.result}
              clockEnabled={false}
              captured={game.captured[playerColor]}
              thinking={thinking}
            />
            <PlayerCard
              player={{
                name: t("play.ai.you"),
                subtitle: playerColor === "w" ? t("coachLive.colorWhite") : t("coachLive.colorBlack"),
                color: playerColor,
              }}
              seconds={0}
              active={game.turn === playerColor && !game.result}
              clockEnabled={false}
              captured={game.captured[botColor]}
            />
            <GamePanel
              title={t("coachLive.panel")}
              meta={
                <StatusPill tone={game.result ? "neutral" : "live"}>
                  {thinking ? t("coachLive.thinking") : t(`coachLive.mode.${mode}`)}
                </StatusPill>
              }
              bodyClassName="space-y-3.5 p-4"
            >
              <StatRow label={t("coachLive.personality")} value={PERSONALITIES[personality].name[locale]} />
              <StatRow label={t("coachLive.mode")} value={t(`coachLive.mode.${mode}`)} />
            </GamePanel>
            {engineError && (
              <GameNotice tone="error">{t("coachLive.engineError", { error: engineError })}</GameNotice>
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
            highlightSquares={moment?.highlight ?? []}
            arrows={
              showArrow && moment?.arrow
                ? [{ from: moment.arrow.from, to: moment.arrow.to, ply: 0 }]
                : []
            }
          />
        }
        right={
          <>
            <CoachPanel
              moment={moment}
              analysing={analysing}
              source={source}
              history={history}
              canRetry={!game.result && moment?.plyIndex === game.moves.length - 2}
              onRetry={retry}
              onDismiss={() => {
                setMoment(null);
                setShowArrow(false);
              }}
              onRevealBest={() => setShowArrow(true)}
            />
            <GamePanel title={t("coachLive.log")} className="max-h-[320px]" bodyClassName="overflow-hidden">
              <MoveList moves={game.moves} />
            </GamePanel>
            <GameActions>
              <Button variant="outline" onClick={() => game.resign(playerColor)} disabled={!!game.result}>
                <Flag className="size-4" /> {t("play.ai.resign")}
              </Button>
              <Button variant="outline" onClick={start}>
                <RefreshCw className="size-4" /> {t("coachLive.rematch")}
              </Button>
            </GameActions>
            <Button
              variant="ghost"
              className="w-full text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground"
              onClick={() => setPhase("setup")}
            >
              <RotateCcw className="size-4" /> {t("coachLive.newSetup")}
            </Button>
          </>
        }
      />
    </AppShell>
  );
}
