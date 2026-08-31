import { createFileRoute, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Chess, type Move } from "chess.js";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { Button } from "@/components/ui/button";
import { PlayerCard } from "@/components/game/PlayerCard";
import { GamePanel, StatRow } from "@/components/game/GamePanel";
import {
  GameLayout,
  GameActions,
  GameNotice,
  StatusPill,
  type StatusTone,
} from "@/components/game/GameLayout";
import { APP } from "@/config/app";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  getGameMoves,
  makeMove,
  finishGame,
  syncGame,
  getRatingEvent,
} from "@/lib/online.functions";
import type {
  GameSnapshot,
  MoveErrorCode,
  MoveOutcome,
  RatingEvent,
} from "@/lib/online.functions";
import { deriveDisplayClock } from "@/lib/online/clock";
import { playSound } from "@/lib/sound";
import type { Game, GameMove } from "@/lib/database.types";
import type { Color } from "@/hooks/useChessGame";
import type { PieceColor } from "@/components/chess/Piece";
import { cn } from "@/lib/utils";
import { Flag, Hand, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import {
  formatTimeControl,
  timeControlSpec,
} from "@/lib/chess/timeControls";
import { normalizeResult, resultCodeFromWinner, resultLabel } from "@/lib/chess/gameResult";
import { ConnectionStatus, type SyncMode } from "@/components/game/ConnectionStatus";
import { MoveJournal, buildJournalEntries } from "@/components/game/MoveJournal";
import { buildPgn, shareUrl } from "@/lib/chess/share";
import { FairplayBridge } from "@/components/game/FairplayBridge";
import { useFairplayTelemetry } from "@/hooks/useFairplayTelemetry";
import { BoardSkeleton } from "@/components/layout/PageSkeleton";

export const Route = createFileRoute("/_authenticated/game/$gameId")({
  head: () => ({
    meta: [
      { title: `Online game — ${APP.name}` },
      { name: "description", content: "Realtime ranked chess match on Nine64." },
      { property: "og:title", content: `Online game — ${APP.name}` },
      { property: "og:description", content: "Realtime ranked chess match on Nine64." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  pendingComponent: BoardSkeleton,
  component: OnlineGamePage,
});

const CONFLICT_LABEL: Record<MoveErrorCode, string> = {
  GAME_NOT_FOUND: "This game no longer exists.",
  NOT_A_PARTICIPANT: "You are not a player in this game.",
  GAME_NOT_ACTIVE: "The game already ended on the server.",
  NOT_YOUR_TURN: "It was no longer your turn.",
  ILLEGAL_MOVE: "That move is not legal in the canonical position.",
  STALE_GAME_VERSION: "Your opponent's move landed first.",
  INTERNAL_ERROR: "The server could not commit that move.",
};

const FALLBACK_POLL_MS = 2500;
const REALTIME_TIMEOUT_MS = 6000;

function OnlineGamePage() {
  const { gameId } = useParams({ from: "/_authenticated/game/$gameId" });
  const { user } = useAuth();
  const syncGameFn = useServerFn(syncGame);
  const getMovesFn = useServerFn(getGameMoves);
  const makeMoveFn = useServerFn(makeMove);
  const finishGameFn = useServerFn(finishGame);
  const getRatingEventFn = useServerFn(getRatingEvent);
  const [ratingEvent, setRatingEvent] = useState<RatingEvent | null>(null);

  const [game, setGame] = useState<Game | null>(null);
  const [moves, setMoves] = useState<GameMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [clock, setClock] = useState({ w: 0, b: 0 });
  const [awaitingFlag, setAwaitingFlag] = useState(false);
  const [boardRev, setBoardRev] = useState(0);
  const [syncMode, setSyncMode] = useState<SyncMode>("connecting");
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingMove, setPendingMove] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const gameRef = useRef<Chess>(new Chess());
  const finishedRef = useRef(false);
  const inFlightRef = useRef(false);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
  /**
   * Canonical clock base captured from the server. The UI only extrapolates
   * from it with a monotonic timer; it never writes clocks anywhere.
   */
  const clockBaseRef = useRef<{
    w: number;
    b: number;
    active: "w" | "b";
    /** ms already elapsed on the active side at the moment of the snapshot */
    elapsedAtSync: number;
    /** performance.now() when the snapshot was applied */
    localAt: number;
    running: boolean;
  }>({ w: 0, b: 0, active: "w", elapsedAtSync: 0, localAt: 0, running: false });



  const myColor: PieceColor | null = useMemo(() => {
    if (!game || !user) return null;
    if (game.white_id === user.id) return "w";
    if (game.black_id === user.id) return "b";
    return null;
  }, [game, user]);

  const orientation: PieceColor = myColor ?? "w";
  const gameLive = game?.status === "active";
  const myTurnNow = Boolean(myColor) && gameLive && gameRef.current.turn() === myColor;
  const fairplay = useFairplayTelemetry({
    gameId,
    enabled: Boolean(myColor) && gameLive,
    myTurn: myTurnNow,
    ply: moves.length,
  });

  useEffect(() => {
    if (game?.status === "completed") void fairplay.flush();
  }, [fairplay, game?.status]);

  // Rating delta is read from the canonical ledger; never recomputed in the browser.
  useEffect(() => {
    if (game?.status !== "completed") return;
    let cancelled = false;
    let attempt = 0;
    const poll = async () => {
      while (!cancelled && attempt < 6) {
        attempt += 1;
        try {
          const ev = (await getRatingEventFn({ data: { gameId } })) as RatingEvent | null;
          if (cancelled) return;
          if (ev) {
            setRatingEvent(ev);
            return;
          }
        } catch {
          /* transient; retry with backoff */
        }
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [game?.status, gameId, getRatingEventFn]);
  const spec = useMemo(() => timeControlSpec(game?.time_control ?? "blitz5m"), [game?.time_control]);
  const result = useMemo(() => (game ? normalizeResult(game) : null), [game]);
  const resultView = useMemo(() => resultLabel(result, myColor), [result, myColor]);

  const applyServerState = useCallback(
    (g: Game, ms: GameMove[], serverNow: string, activeSide: "w" | "b") => {
      setGame(g);
      setMoves(ms.slice().sort((a, b) => a.move_number - b.move_number));

      const chess = new Chess();
      try {
        chess.load(g.initial_fen || g.current_fen);
      } catch {
        chess.reset();
      }
      for (const m of ms.slice().sort((a, b) => a.move_number - b.move_number)) {
        try {
          chess.move(m.san);
        } catch {
          // ignore invalid moves
        }
      }
      gameRef.current = chess;

      // Canonical clock base: remaining ms per side at the start of the active
      // turn, plus how much of that turn the *server* says already elapsed.
      const anchor = g.turn_started_at ?? g.last_move_at ?? g.created_at;
      const running = g.status === "active" && g.clock_state === "running";
      const elapsedAtSync = running
        ? Math.max(0, Date.parse(serverNow) - Date.parse(anchor))
        : 0;
      clockBaseRef.current = {
        w: g.white_time_ms,
        b: g.black_time_ms,
        active: activeSide,
        elapsedAtSync,
        localAt: performance.now(),
        running,
      };
      setClock({
        w: activeSide === "w" ? Math.max(0, g.white_time_ms - elapsedAtSync) : g.white_time_ms,
        b: activeSide === "b" ? Math.max(0, g.black_time_ms - elapsedAtSync) : g.black_time_ms,
      });
      setAwaitingFlag(false);
      setBoardRev((v) => v + 1);
      setPendingMove(null);

      const last = ms[ms.length - 1];
      if (last) setLastMove({ from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) });
      if (g.status === "completed") {
        if (!finishedRef.current) playSound(g.result === "1/2-1/2" ? "draw" : "checkmate");
        finishedRef.current = true;
      }
      setLastSyncAt(Date.now());
    },
    [],
  );

  const refresh = useCallback(
    async (opts?: { showSpinner?: boolean }) => {
      if (opts?.showSpinner) setSyncing(true);
      try {
        const [snap, ms] = await Promise.all([
          syncGameFn({ data: { gameId } }) as Promise<GameSnapshot>,
          getMovesFn({ data: { gameId } }) as Promise<GameMove[]>,
        ]);
        applyServerState(snap.game, ms, snap.serverNow, snap.activeSide);
        setError(null);
        setSyncMode((mode) => (mode === "offline" ? "fallback" : mode));
      } catch (e) {
        setSyncMode("offline");
        if (opts?.showSpinner) setError(e instanceof Error ? e.message : "Sync failed");
        throw e;
      } finally {
        if (opts?.showSpinner) setSyncing(false);
      }
    },
    [applyServerState, gameId, getMovesFn, syncGameFn],
  );


  useEffect(() => {
    void (async () => {
      try {
        await refresh();
      } catch {
        setError("Failed to load game");
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  // Realtime subscriptions with connection tracking
  useEffect(() => {
    if (!gameId) return;
    setSyncMode("connecting");

    const onChannelStatus = (status: string) => {
      if (status === "SUBSCRIBED") setSyncMode("realtime");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setSyncMode((mode) => (mode === "offline" ? mode : "fallback"));
      }
    };

    // Realtime is a change *signal* only: never rebuild the board from the
    // event payload — always pull the canonical snapshot from the server.
    const movesChannel = supabase
      .channel(`game_moves:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_moves", filter: `game_id=eq.${gameId}` },
        () => {
          void refresh();
        },
      )
      .subscribe(onChannelStatus);

    const gameChannel = supabase
      .channel(`game:${gameId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        () => {
          void refresh();
        },
      )
      .subscribe(onChannelStatus);

    channelsRef.current = [movesChannel, gameChannel];

    const timeout = window.setTimeout(() => {
      setSyncMode((mode) => (mode === "realtime" ? mode : "fallback"));
    }, REALTIME_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
      for (const ch of channelsRef.current) void supabase.removeChannel(ch);
      channelsRef.current = [];
    };
  }, [gameId, refresh]);

  // Fallback polling whenever realtime is not confirmed
  useEffect(() => {
    if (syncMode === "realtime") return;
    if (game && game.status !== "active") return;
    const id = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, FALLBACK_POLL_MS);
    return () => window.clearInterval(id);
  }, [game, refresh, syncMode]);

  // Display-only countdown: extrapolated from the canonical server base with a
  // monotonic timer. Nothing here is ever written back to the database.
  useEffect(() => {
    if (!game || game.status !== "active") return;
    const id = window.setInterval(() => {
      const base = clockBaseRef.current;
      if (!base.running) return;
      const next = deriveDisplayClock(
        {
          whiteTimeMs: base.w,
          blackTimeMs: base.b,
          activeSide: base.active,
          elapsedAtSyncMs: base.elapsedAtSync,
          running: base.running,
        },
        performance.now() - base.localAt,
      );
      setClock({ w: next.w, b: next.b });
      if (next.expired) setAwaitingFlag(true);
    }, 100);
    return () => window.clearInterval(id);
  }, [game, boardRev]);

  // When the estimated countdown hits zero we ask the server to rule on it.
  // The client never declares a winner by itself.
  useEffect(() => {
    if (!awaitingFlag || !game || game.status !== "active") return;
    let cancelled = false;
    const id = window.setInterval(() => {
      if (cancelled) return;
      void refresh().catch(() => undefined);
    }, 1500);
    void refresh().catch(() => undefined);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [awaitingFlag, game, refresh]);

  // Resync canonical state on reconnect and when the tab regains focus.
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState === "hidden") return;
      void refresh().catch(() => undefined);
    };
    window.addEventListener("focus", resync);
    window.addEventListener("online", resync);
    document.addEventListener("visibilitychange", resync);
    return () => {
      window.removeEventListener("focus", resync);
      window.removeEventListener("online", resync);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [refresh]);

  /**
   * Terminal commands: the client only names the action and the version it saw.
   * Result, winner and end reason always come back from the server.
   */
  const runCommand = useCallback(
    async (kind: "resign" | "timeout" | "abort") => {
      if (!game || !myColor || commandBusy) return;
      setCommandBusy(true);
      try {
        const fn =
          kind === "resign" ? resignGameFn : kind === "timeout" ? claimTimeoutFn : abortGameFn;
        const out = (await fn({
          data: { gameId: game.id, expectedVersion: game.version ?? 0 },
        })) as CommandOutcome;
        if (!out.ok && out.code === "ABORT_NOT_ALLOWED") {
          setConflict("Không thể huỷ ván sau khi đã có nước đi.");
        }
      } catch {
        // Idempotent commands: the resync below shows the canonical outcome.
      } finally {
        await refresh().catch(() => undefined);
        setCommandBusy(false);
      }
    },
    [abortGameFn, claimTimeoutFn, commandBusy, game, myColor, refresh, resignGameFn],
  );



  const submitMove = useCallback(
    async (args: {
      from: string;
      to: string;
      promotion?: "q" | "r" | "b" | "n";
      expectedVersion: number;
    }): Promise<void> => {
      if (!game || !myColor) return;
      inFlightRef.current = true;
      try {
        const res = (await makeMoveFn({
          data: {
            gameId: game.id,
            from: args.from,
            to: args.to,
            ...(args.promotion ? { promotion: args.promotion } : {}),
            expectedVersion: args.expectedVersion,
          },
        })) as MoveOutcome;

        setLastSyncAt(Date.now());

        if (res.ok) {
          setConflict(null);
          // Always adopt the canonical snapshot the server just committed.
          await refresh().catch(() => undefined);
          return;
        }

        // ---- Rejected: resync canonical state, never blind-retry ----
        setPendingMove(null);
        const label = CONFLICT_LABEL[res.code] ?? "The server rejected that move.";
        await refresh({ showSpinner: true }).catch(() => undefined);
        setConflict(`${label} Board resynced from the server.`);
      } catch (e: unknown) {
        gameRef.current.undo();
        setLastMove(null);
        setPendingMove(null);
        setBoardRev((v) => v + 1);
        setError(e instanceof Error ? e.message : "Move failed");
        await refresh().catch(() => undefined);
      } finally {
        inFlightRef.current = false;
      }
    },
    [game, makeMoveFn, myColor, refresh],
  );


  const handleMove = useCallback(
    (from: string, to: string, promotion?: "q" | "r" | "b" | "n") => {
      if (!game || !myColor || finishedRef.current) return false;
      if (game.status !== "active") return false;
      if (gameRef.current.turn() !== myColor) return false;
      // Guard against a second submission while one is still in flight.
      if (inFlightRef.current) {
        toast.info("Still syncing your previous move…");
        return false;
      }

      // Local preview only — the server re-derives SAN/FEN from the intent.
      let move: Move | null = null;
      try {
        move = gameRef.current.move({ from, to, promotion: promotion ?? "q" });
      } catch {
        move = null;
      }
      if (!move) {
        playSound("illegal");
        return false;
      }

      // Board preview only. The clock keeps running on the current base until
      // the server returns the canonical clocks for the committed move.
      setLastMove({ from: move.from, to: move.to });
      setPendingMove(move.san);
      setBoardRev((v) => v + 1);
      playMoveSound(gameRef.current, move);

      void submitMove({
        from,
        to,
        ...(promotion ? { promotion } : {}),
        expectedVersion: game.version ?? 0,
      });

      return true;
    },
    [game, myColor, submitMove],
  );



  const canMoveFrom = useCallback(
    (square: string) => {
      if (!myColor || finishedRef.current || game?.status !== "active") return false;
      if (gameRef.current.turn() !== myColor) return false;
      const piece = gameRef.current.get(square as never);
      return piece?.color === myColor;
    },
    [game?.status, myColor],
  );

  const legalTargets = useCallback((square: string) => {
    try {
      return gameRef.current
        .moves({ square: square as never, verbose: true })
        .map((m) => (m as Move).to as string);
    } catch {
      return [];
    }
  }, []);

  const needsPromotion = useCallback((from: string, to: string) => {
    const piece = gameRef.current.get(from as never);
    if (!piece || piece.type !== "p") return false;
    return (piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1");
  }, []);

  const pieces = useMemo(() => {
    return gameRef.current
      .board()
      .flat()
      .filter((sq): sq is NonNullable<typeof sq> => sq !== null)
      .map((sq) => ({ square: sq.square as string, type: sq.type, color: sq.color as PieceColor }));
  }, [moves, result, boardRev]);

  const checkSquare = useMemo(() => {
    if (!gameRef.current.isCheck()) return null;
    const turn = gameRef.current.turn();
    for (const row of gameRef.current.board()) {
      for (const sq of row) {
        if (sq && sq.type === "k" && sq.color === turn) return sq.square as string;
      }
    }
    return null;
  }, [moves, result, boardRev]);

  const isCheckmate = useMemo(
    () => gameRef.current.isCheckmate(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [moves, result, boardRev],
  );

  const journalEntries = useMemo(() => {
    const entries = buildJournalEntries(moves, {
      baseMs: spec.baseMs,
      incrementMs: spec.incrementMs,
    });
    if (pendingMove && !moves.some((m) => m.san === pendingMove && m.move_number === moves.length)) {
      entries.push({
        ply: entries.length + 1,
        san: pendingMove,
        color: entries.length % 2 === 0 ? "w" : "b",
        pending: true,
      });
    }
    return entries;
  }, [moves, pendingMove, spec.baseMs, spec.incrementMs]);

  const sanList = useMemo(() => moves.map((m) => m.san), [moves]);

  const pgn = useMemo(() => {
    if (!game) return "";
    const meta: Parameters<typeof buildPgn>[1] = {
      event: "Nine64 online",
      white: `White (${game.white_rating})`,
      black: `Black (${game.black_rating})`,
      result: result?.code ?? "*",
      timeControl: game.time_control,
      variant: game.variant,
    };
    if (game.initial_fen && game.variant !== "standard") meta.startFen = game.initial_fen;
    return buildPgn(sanList, meta);
  }, [game, result, sanList]);

  const copy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard unavailable");
    }
  }, []);

  const resign = useCallback(async () => {
    if (!game || !myColor || finishedRef.current) return;
    await finishIfOver("Resignation", myColor === "w" ? "b" : "w");
  }, [finishIfOver, game, myColor]);

  const offerDraw = useCallback(async () => {
    if (!game || !myColor || finishedRef.current) return;
    await finishIfOver("Agreement", "draw");
  }, [finishIfOver, game, myColor]);

  if (loading) {
    return (
      <AppShell wide>
        <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
          Loading game…
        </div>
      </AppShell>
    );
  }

  if (!game) {
    return (
      <AppShell wide>
        <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-muted-foreground">
          <p>{error || "Game not found"}</p>
          <Button onClick={() => void refresh({ showSpinner: true })}>Retry</Button>
        </div>
      </AppShell>
    );
  }

  const opponentName = myColor === "w" ? game.black_id.slice(0, 8) : game.white_id.slice(0, 8);
  const myName = user?.email?.split("@")[0] ?? "You";
  const turn = gameRef.current.turn() as PieceColor;
  const live = game.status === "active" && !result;
  const statusLine = live
    ? `${turn === myColor ? "Your move" : "Waiting for opponent"} · ply ${moves.length + 1} · ${
        syncMode === "realtime" ? "realtime" : "backup sync"
      }`
    : `${resultView.title} — ${result?.reason ?? "finished"} (${result?.code ?? "*"})`;

  const opponentRating = myColor === "w" ? game.black_rating : game.white_rating;
  const myRating = myColor === "w" ? game.white_rating : game.black_rating;
  const opponentColor: PieceColor = myColor === "w" ? "b" : "w";

  return (
    <AppShell wide>
      <GameLayout
        left={
          <>
            <PlayerCard
              player={{
                name: opponentName,
                subtitle: `Rating ${opponentRating}`,
                color: opponentColor,
              }}
              seconds={(opponentColor === "w" ? clock.w : clock.b) / 1000}
              active={turn !== myColor && live}
              clockEnabled={!!game.time_control}
              captured={[]}
            />
            <PlayerCard
              player={{
                name: myName,
                subtitle: `Rating ${myRating}`,
                color: myColor ?? "w",
              }}
              seconds={((myColor ?? "w") === "w" ? clock.w : clock.b) / 1000}
              active={turn === myColor && live}
              clockEnabled={!!game.time_control}
              captured={[]}
            />
            <GamePanel
              title="Game status"
              meta={
                <StatusPill tone={live ? "live" : (resultView.tone as StatusTone)}>
                  {live ? "Live" : resultView.title}
                </StatusPill>
              }
              bodyClassName="space-y-3.5 p-4"
            >
              <StatRow label="Variant" value={game.variant} />
              <StatRow label="Time control" value={formatTimeControl(game.time_control)} mono />
              <StatRow label="Sync" value={syncMode === "realtime" ? "Realtime" : "Backup"} />
              {result && <StatRow label="Result" value={`${result.reason} · ${result.code}`} />}
            </GamePanel>
            <ConnectionStatus
              mode={syncMode}
              lastSyncAt={lastSyncAt}
              syncing={syncing}
              onRefresh={() => void refresh({ showSpinner: true }).catch(() => undefined)}
            />
            {conflict && (
              <GameNotice tone="warning">
                <span className="font-semibold">Move conflict handled: </span>
                {conflict}
              </GameNotice>
            )}
            {awaitingFlag && game?.status === "active" && (
              <GameNotice tone="warning">
                Hết giờ trên màn hình — đang chờ máy chủ xác nhận kết quả…
              </GameNotice>
            )}
            {error && <GameNotice tone="error">{error}</GameNotice>}

          </>
        }
        board={
          <>
            <ChessBoard
              pieces={pieces}
              orientation={orientation}
              legalTargets={legalTargets}
              canMoveFrom={canMoveFrom}
              onMove={handleMove}
              needsPromotion={needsPromotion}
              lastMove={lastMove}
              checkSquare={checkSquare}
              checkmate={isCheckmate}
              turn={turn}
              interactive={live}
            />
            {game.status === "completed" && (
              <FairplayBridge
                gameId={game.id}
                initialFen={game.initial_fen}
                moves={moves}
                whiteId={game.white_id}
                blackId={game.black_id}
                runAnalysis={myColor === "w"}
              />
            )}
          </>
        }
        right={
          <>
            <GamePanel
              title="Move journal"
              meta={moves.length > 0 ? `Move ${Math.ceil(moves.length / 2)}` : undefined}
              className="max-h-[420px]"
              bodyClassName="overflow-hidden p-4"
            >
              <MoveJournal entries={journalEntries} statusLine={statusLine} />
            </GamePanel>

            {live && (
              <GameActions>
                <Button variant="outline" onClick={() => void offerDraw()}>
                  <Hand className="size-4" /> Draw
                </Button>
                <Button variant="outline" onClick={() => void resign()}>
                  <Flag className="size-4" /> Resign
                </Button>
              </GameActions>
            )}

            {ratingEvent && myColor && (
              <GamePanel title="Hệ số Glicko-2" bodyClassName="space-y-1.5 p-4">
                <StatRow
                  label="Trước ván"
                  value={String(
                    myColor === "w"
                      ? ratingEvent.white_rating_before
                      : ratingEvent.black_rating_before,
                  )}
                />
                <StatRow
                  label="Sau ván"
                  value={String(
                    myColor === "w"
                      ? ratingEvent.white_rating_after
                      : ratingEvent.black_rating_after,
                  )}
                />
                <StatRow
                  label="Thay đổi"
                  value={(() => {
                    const d = myColor === "w" ? ratingEvent.white_delta : ratingEvent.black_delta;
                    return `${d > 0 ? "+" : ""}${d}`;
                  })()}
                />
              </GamePanel>
            )}

            <GamePanel title="Share this game" bodyClassName="space-y-2.5 p-4">
              <p className="text-xs text-muted-foreground">
                Copy the PGN, or send a turn-by-turn link your opponent can open on another device.
              </p>
              <GameActions>
                <Button variant="outline" size="sm" onClick={() => void copy(pgn, "PGN")}>
                  <Copy className="size-4" /> PGN
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void copy(
                      shareUrl({
                        moves: sanList,
                        turnFor: turn,
                        white: "White",
                        black: "Black",
                        ...(game.variant !== "standard" ? { startFen: game.initial_fen } : {}),
                      }),
                      "Share link",
                    )
                  }
                >
                  <Share2 className="size-4" /> Link
                </Button>
              </GameActions>
            </GamePanel>
          </>
        }
      />
    </AppShell>
  );
}


function playMoveSound(game: Chess, move: Move) {
  if (game.isCheck()) {
    playSound("check");
  } else if (move.flags.includes("p")) {
    playSound("promotion");
  } else if (move.flags.includes("k") || move.flags.includes("q")) {
    playSound("castle");
  } else if (move.captured) {
    playSound("capture");
  } else {
    playSound("move");
  }
}
