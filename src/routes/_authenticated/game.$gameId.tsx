import { createFileRoute, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Chess, type Move } from "chess.js";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { APP } from "@/config/app";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { getGame, getGameMoves, makeMove, finishGame } from "@/lib/online.functions";
import type { MoveCommitResult } from "@/lib/online.functions";
import { playSound } from "@/lib/sound";
import type { Game, GameMove } from "@/lib/database.types";
import type { Color } from "@/hooks/useChessGame";
import type { PieceColor } from "@/components/chess/Piece";
import { cn } from "@/lib/utils";
import { Flag, Hand, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import {
  formatClock,
  formatTimeControl,
  timeControlSpec,
} from "@/lib/chess/timeControls";
import { normalizeResult, resultCodeFromWinner, resultLabel } from "@/lib/chess/gameResult";
import { ConnectionStatus, type SyncMode } from "@/components/game/ConnectionStatus";
import { MoveJournal, buildJournalEntries } from "@/components/game/MoveJournal";
import { buildPgn, shareUrl } from "@/lib/chess/share";
import { FairplayBridge } from "@/components/game/FairplayBridge";
import { useFairplayTelemetry } from "@/hooks/useFairplayTelemetry";

export const Route = createFileRoute("/_authenticated/game/$gameId")({
  head: () => ({
    meta: [
      { title: `Online game — ${APP.name}` },
      { name: "description", content: "Realtime ranked chess match on Nexus Chess." },
      { property: "og:title", content: `Online game — ${APP.name}` },
      { property: "og:description", content: "Realtime ranked chess match on Nexus Chess." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OnlineGamePage,
});

const FALLBACK_POLL_MS = 2500;
const REALTIME_TIMEOUT_MS = 6000;

function OnlineGamePage() {
  const { gameId } = useParams({ from: "/_authenticated/game/$gameId" });
  const { user } = useAuth();
  const getGameFn = useServerFn(getGame);
  const getMovesFn = useServerFn(getGameMoves);
  const makeMoveFn = useServerFn(makeMove);
  const finishGameFn = useServerFn(finishGame);

  const [game, setGame] = useState<Game | null>(null);
  const [moves, setMoves] = useState<GameMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [clock, setClock] = useState({ w: 0, b: 0 });
  const [boardRev, setBoardRev] = useState(0);
  const [syncMode, setSyncMode] = useState<SyncMode>("connecting");
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingMove, setPendingMove] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const gameRef = useRef<Chess>(new Chess());
  const finishedRef = useRef(false);
  const tickRef = useRef<number>(Date.now());
  const inFlightRef = useRef(false);
  const clockRef = useRef({ w: 0, b: 0 });
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);


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
  const spec = useMemo(() => timeControlSpec(game?.time_control ?? "blitz5m"), [game?.time_control]);
  const result = useMemo(() => (game ? normalizeResult(game) : null), [game]);
  const resultView = useMemo(() => resultLabel(result, myColor), [result, myColor]);

  const applyServerState = useCallback((g: Game, ms: GameMove[]) => {
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
    setClock({ w: g.white_time_ms, b: g.black_time_ms });
    tickRef.current = Date.now();
    setBoardRev((v) => v + 1);
    setPendingMove(null);

    const last = ms[ms.length - 1];
    if (last) setLastMove({ from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) });
    if (g.status === "completed") finishedRef.current = true;
    setLastSyncAt(Date.now());
  }, []);

  const refresh = useCallback(
    async (opts?: { showSpinner?: boolean }) => {
      if (opts?.showSpinner) setSyncing(true);
      try {
        const [g, ms] = await Promise.all([
          getGameFn({ data: { gameId } }) as Promise<Game>,
          getMovesFn({ data: { gameId } }) as Promise<GameMove[]>,
        ]);
        applyServerState(g, ms);
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
    [applyServerState, gameId, getGameFn, getMovesFn],
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

    const movesChannel = supabase
      .channel(`game_moves:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_moves", filter: `game_id=eq.${gameId}` },
        (payload) => {
          const move = payload.new as GameMove;
          setLastSyncAt(Date.now());
          setMoves((prev) => {
            if (prev.some((m) => m.id === move.id)) return prev;
            return [...prev, move].sort((a, b) => a.move_number - b.move_number);
          });
          setPendingMove(null);

          if (gameRef.current.history().length < move.move_number) {
            try {
              const m = gameRef.current.move(move.san);
              if (m) {
                setLastMove({ from: m.from, to: m.to });
                playMoveSound(gameRef.current, m);
                setBoardRev((v) => v + 1);
              }
            } catch {
              // out of sync — full refresh
              void refresh();
            }
          }
          setClock({ w: move.white_time_ms, b: move.black_time_ms });
          tickRef.current = Date.now();
        },
      )
      .subscribe(onChannelStatus);

    const gameChannel = supabase
      .channel(`game:${gameId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        (payload) => {
          const updated = payload.new as Game;
          setLastSyncAt(Date.now());
          setGame(updated);
          setClock({ w: updated.white_time_ms, b: updated.black_time_ms });
          tickRef.current = Date.now();
          if (updated.status === "completed" && !finishedRef.current) {
            finishedRef.current = true;
            playSound(updated.result === "1/2-1/2" ? "draw" : "checkmate");
          }
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

  // Shared clock ticking (wall-clock based so realtime and fallback agree)
  useEffect(() => {
    if (!game || game.status !== "active") return;
    tickRef.current = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const delta = now - tickRef.current;
      tickRef.current = now;
      const turn = gameRef.current.turn() as "w" | "b";
      setClock((prev) => ({ ...prev, [turn]: Math.max(0, prev[turn] - delta) }));
    }, 100);
    return () => window.clearInterval(id);
  }, [game, boardRev]);

  // Keep a ref of the live clock so conflict retries use fresh values
  useEffect(() => {
    clockRef.current = clock;
  }, [clock]);

  const finishIfOver = useCallback(
    async (reason: string, winner: Color | "draw") => {
      if (finishedRef.current || !game) return;
      finishedRef.current = true;
      const code = resultCodeFromWinner(winner as "w" | "b" | "draw");
      const winnerId = winner === "w" ? game.white_id : winner === "b" ? game.black_id : null;
      setGame({ ...game, status: "completed", result: code, end_reason: reason });

      try {
        await finishGameFn({
          data: {
            gameId: game.id,
            result: code,
            winnerId,
            endReason: reason,
            finalFen: gameRef.current.fen(),
          },
        });
      } catch {
        // server may have already finished the game
      }
    },
    [finishGameFn, game],
  );

  // Flag fall detection (same rule in realtime and fallback mode)
  useEffect(() => {
    if (!game || game.status !== "active" || finishedRef.current) return;
    if (clock.w <= 0) void finishIfOver("White flagged", "b");
    else if (clock.b <= 0) void finishIfOver("Black flagged", "w");
  }, [clock, finishIfOver, game]);

  const submitMove = useCallback(
    async (
      args: {
        from: string;
        to: string;
        promotion?: "q" | "r" | "b" | "n";
        san: string;
        uci: string;
        fen: string;
        baseFen: string;
        clock: { w: number; b: number };
        previousClock: { w: number; b: number };
      },
      attempt: number,
    ): Promise<void> => {
      if (!game || !myColor) return;
      inFlightRef.current = true;
      try {
        const res = (await makeMoveFn({
          data: {
            gameId: game.id,
            san: args.san,
            uci: args.uci,
            fen: args.fen,
            baseFen: args.baseFen,
            whiteTimeMs: Math.round(args.clock.w),
            blackTimeMs: Math.round(args.clock.b),
          },
        })) as MoveCommitResult;

        setLastSyncAt(Date.now());

        if (res.applied) {
          setPendingMove(null);
          setConflict(null);
          if (syncMode !== "realtime") void refresh().catch(() => undefined);
          if (gameRef.current.isCheckmate()) void finishIfOver("Checkmate", myColor);
          else if (gameRef.current.isDraw()) void finishIfOver("Draw", "draw");
          return;
        }

        // ---- Conflict: the server state moved on without our move ----
        setPendingMove(null);
        const label =
          res.reason === "game_over"
            ? "The game already ended on the server."
            : res.reason === "not_your_turn"
              ? "It was no longer your turn."
              : "Your opponent's move landed first.";

        // Rebuild the board from the authoritative server state.
        await refresh({ showSpinner: true }).catch(() => undefined);

        const canRetry =
          attempt === 0 &&
          res.reason === "stale_position" &&
          res.status === "active" &&
          gameRef.current.turn() === myColor;

        if (canRetry) {
          let replay: Move | null = null;
          const baseFen = gameRef.current.fen();
          try {
            replay = gameRef.current.move({
              from: args.from,
              to: args.to,
              promotion: args.promotion ?? "q",
            });
          } catch {
            replay = null;
          }
          if (replay) {
            const nextClock = { w: clockRef.current.w, b: clockRef.current.b };
            nextClock[myColor] = Math.max(0, nextClock[myColor]) + spec.incrementMs;
            tickRef.current = Date.now();
            setLastMove({ from: replay.from, to: replay.to });
            setClock(nextClock);
            setPendingMove(replay.san);
            setBoardRev((v) => v + 1);
            setConflict(`${label} Re-sent your move on the new position.`);
            toast.info("Move conflict resolved", {
              description: `${label} Your move was replayed on the updated position.`,
            });
            await submitMove(
              {
                ...args,
                san: replay.san,
                fen: gameRef.current.fen(),
                baseFen,
                clock: nextClock,
                previousClock: { ...clockRef.current },
              },
              attempt + 1,
            );
            return;
          }
        }

        setConflict(`${label} Board resynced from the server — play again.`);
        toast.warning("Move conflict", {
          description: `${label} The board was resynced from the server.`,
        });
      } catch (e: unknown) {
        gameRef.current.undo();
        setLastMove(null);
        setClock(args.previousClock);
        setPendingMove(null);
        setBoardRev((v) => v + 1);
        setError(e instanceof Error ? e.message : "Move failed");
      } finally {
        inFlightRef.current = false;
      }
    },
    [finishIfOver, game, makeMoveFn, myColor, refresh, spec.incrementMs, syncMode],
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

      const baseFen = gameRef.current.fen();
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

      const previousClock = { ...clock };
      const nextClock = { ...clock };
      nextClock[myColor] = Math.max(0, nextClock[myColor]) + spec.incrementMs;
      tickRef.current = Date.now();

      const currentFen = gameRef.current.fen();
      setLastMove({ from: move.from, to: move.to });
      setClock(nextClock);
      setPendingMove(move.san);
      setBoardRev((v) => v + 1);
      playMoveSound(gameRef.current, move);

      void submitMove(
        {
          from,
          to,
          ...(promotion ? { promotion } : {}),
          san: move.san,
          uci: `${from}${to}${promotion ?? ""}`,
          fen: currentFen,
          baseFen,
          clock: nextClock,
          previousClock,
        },
        0,
      );

      return true;
    },
    [clock, game, myColor, spec.incrementMs, submitMove],
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
      event: "Nexus Chess online",
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

  return (
    <AppShell wide>
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <PlayerBar
            name={opponentName}
            rating={myColor === "w" ? game.black_rating : game.white_rating}
            color={myColor === "w" ? "b" : "w"}
            clock={clock}
            active={turn !== myColor && live}
          />
          <div className="mt-2">
            <ChessBoard
              pieces={pieces}
              orientation={orientation}
              legalTargets={legalTargets}
              canMoveFrom={canMoveFrom}
              onMove={handleMove}
              needsPromotion={needsPromotion}
              lastMove={lastMove}
              checkSquare={checkSquare}
              turn={turn}
              interactive={live}
            />
          </div>
          <PlayerBar
            name={myName}
            rating={myColor === "w" ? game.white_rating : game.black_rating}
            color={myColor ?? "w"}
            clock={clock}
            active={turn === myColor && live}
          />
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {game.variant} · {formatTimeControl(game.time_control)}
              </span>
              <span
                className={cn(
                  "rounded px-2 py-0.5 text-xs font-medium",
                  live && "bg-emerald-500/15 text-emerald-400",
                  !live && resultView.tone === "win" && "bg-emerald-500/15 text-emerald-400",
                  !live && resultView.tone === "loss" && "bg-destructive/15 text-destructive",
                  !live && resultView.tone === "draw" && "bg-muted text-muted-foreground",
                )}
              >
                {live ? "Live" : resultView.title}
              </span>
            </div>
            {result && (
              <div className="mt-3 rounded-md bg-muted p-3 text-sm">
                <p className="font-semibold">{resultView.title}</p>
                <p className="text-muted-foreground">
                  {result.reason} · {result.code}
                </p>
              </div>
            )}
            {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
          </Card>

          <ConnectionStatus
            mode={syncMode}
            lastSyncAt={lastSyncAt}
            syncing={syncing}
            onRefresh={() => void refresh({ showSpinner: true }).catch(() => undefined)}
          />

          {conflict && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <span className="font-semibold">Move conflict handled: </span>
              {conflict}
            </div>
          )}

          {live && (
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1 gap-2" onClick={() => void offerDraw()}>
                <Hand className="size-4" />
                Draw
              </Button>
              <Button variant="destructive" className="flex-1 gap-2" onClick={() => void resign()}>
                <Flag className="size-4" />
                Resign
              </Button>
            </div>
          )}

          <Card className="p-4">
            <MoveJournal entries={journalEntries} statusLine={statusLine} />
          </Card>

          <Card className="space-y-2 p-4">
            <h3 className="text-sm font-semibold">Share this game</h3>
            <p className="text-xs text-muted-foreground">
              Copy the PGN, or send a turn-by-turn link your opponent can open on another device.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="flex-1 gap-2"
                onClick={() => void copy(pgn, "PGN")}
              >
                <Copy className="size-4" />
                PGN
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1 gap-2"
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
                <Share2 className="size-4" />
                Link
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function PlayerBar({
  name,
  rating,
  color,
  clock,
  active,
}: {
  name: string;
  rating: number;
  color: PieceColor;
  clock: { w: number; b: number };
  active: boolean;
}) {
  const ms = color === "w" ? clock.w : clock.b;
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md border border-border/70 bg-surface-1 px-3 py-2",
        active && "ring-1 ring-primary/50",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
            color === "w" ? "bg-white text-black" : "bg-black text-white ring-1 ring-white/20",
          )}
        >
          {color === "w" ? "W" : "B"}
        </span>
        <span className="font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">({rating})</span>
      </div>
      <span className={cn("font-mono text-lg tabular-nums", ms <= 10_000 && "text-destructive")}>
        {formatClock(ms)}
      </span>
    </div>
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
