import { createFileRoute, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { rulesFor, type AppliedMove, type RulesPosition } from "@/lib/chess/rules";
import type { VariantId } from "@/config/variants";
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
import { sideToMoveFromFen } from "@/lib/online/moveEngine";
import { supabase } from "@/integrations/supabase/client";
import {
  makeMove,
  resignGame,
  claimTimeout,
  abortGame,
  syncGameState,
  getRatingEvent,
  getDrawOffers,
  offerDraw,
  acceptDraw,
  declineDraw,
  cancelDraw,
  getGamePlayers,
} from "@/lib/online.functions";
import type {
  CommandOutcome,
  DrawCommandOutcome,
  GameDelta,
  MoveErrorCode,
  MoveOutcome,
  RatingEvent,
} from "@/lib/online.functions";
import {
  getTakebackState,
  requestTakeback,
  respondTakeback,
  touchPresence,
  createChallenge,
  type TakebackRequest,
} from "@/lib/online.challenges.functions";
import { parseTimeControl, timeControlLabel } from "@/lib/online/timeControl";
import { deriveDisplayClock } from "@/lib/online/clock";
import { playSound } from "@/lib/sound";
import type { DrawOffer, Game, GameMove } from "@/lib/database.types";
import type { PieceColor } from "@/components/chess/Piece";
import { cn } from "@/lib/utils";
import { Flag, Hand, Ban, Copy, Share2, Undo2, Swords, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { timeControlSpec } from "@/lib/chess/timeControls";
import { normalizeResult, resultLabel } from "@/lib/chess/gameResult";
import { ConnectionStatus, type SyncMode } from "@/components/game/ConnectionStatus";
import { MoveJournal, buildJournalEntries } from "@/components/game/MoveJournal";
import { GameChatPanel } from "@/components/game/GameChatPanel";
import { buildPgn, shareUrl } from "@/lib/chess/share";
import { useFairplayTelemetry } from "@/hooks/useFairplayTelemetry";
import { ReportPlayerCard } from "@/components/game/ReportPlayerCard";
import { BoardSkeleton } from "@/components/layout/PageSkeleton";
import { uniqueTopic } from "@/lib/realtime";

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
  const syncStateFn = useServerFn(syncGameState);
  const makeMoveFn = useServerFn(makeMove);
  const resignGameFn = useServerFn(resignGame);
  const claimTimeoutFn = useServerFn(claimTimeout);
  const abortGameFn = useServerFn(abortGame);
  const getRatingEventFn = useServerFn(getRatingEvent);
  const getDrawOffersFn = useServerFn(getDrawOffers);
  const offerDrawFn = useServerFn(offerDraw);
  const acceptDrawFn = useServerFn(acceptDraw);
  const declineDrawFn = useServerFn(declineDraw);
  const cancelDrawFn = useServerFn(cancelDraw);
  const getTakebackStateFn = useServerFn(getTakebackState);
  const requestTakebackFn = useServerFn(requestTakeback);
  const respondTakebackFn = useServerFn(respondTakeback);
  const touchPresenceFn = useServerFn(touchPresence);
  const createChallengeFn = useServerFn(createChallenge);
  const getGamePlayersFn = useServerFn(getGamePlayers);
  const [playerNames, setPlayerNames] = useState<{ whiteName: string; blackName: string } | null>(
    null,
  );
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
  const [commandBusy, setCommandBusy] = useState(false);
  // Draw offers are server state; the UI only mirrors the canonical row.
  const [drawPending, setDrawPending] = useState<DrawOffer | null>(null);
  const [drawLatest, setDrawLatest] = useState<DrawOffer | null>(null);
  const [drawBusy, setDrawBusy] = useState(false);
  const [drawNotice, setDrawNotice] = useState<string | null>(null);
  // Takeback is server state too — casual games only, both players must agree.
  const [takebackPending, setTakebackPending] = useState<TakebackRequest | null>(null);
  const [takebackBusy, setTakebackBusy] = useState(false);
  const [rematchBusy, setRematchBusy] = useState(false);
  const [rematchSent, setRematchSent] = useState(false);
  const [opponentSeenAt, setOpponentSeenAt] = useState<number | null>(null);
  /** Armed premove: replayed the instant the server says it is our turn. */
  const [premove, setPremove] = useState<{ from: string; to: string } | null>(null);

  // Rule engine is variant-driven: Chess960 never goes through chess.js.
  const gameRef = useRef<RulesPosition>(rulesFor("standard").createPosition());
  /** FEN captured before an optimistic move, used to roll the preview back. */
  const preMoveFenRef = useRef<string | null>(null);
  /** Full canonical move list; delta syncs append to it. */
  const movesRef = useRef<GameMove[]>([]);
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
  const spec = useMemo(() => {
    const parsed = parseTimeControl(game?.time_control ?? "blitz5m");
    return parsed.valid
      ? { baseMs: parsed.baseMs, incrementMs: parsed.incMs }
      : timeControlSpec(game?.time_control ?? "blitz5m");
  }, [game?.time_control]);
  const result = useMemo(() => (game ? normalizeResult(game) : null), [game]);
  const resultView = useMemo(() => resultLabel(result, myColor), [result, myColor]);

  const applyServerState = useCallback(
    (g: Game, ms: GameMove[], serverNow: string, activeSide: "w" | "b") => {
      setGame(g);
      const sorted = ms.slice().sort((a, b) => a.move_number - b.move_number);
      movesRef.current = sorted;
      setMoves(sorted);


      const rules = rulesFor((g.variant ?? "standard") as VariantId);
      let chess: RulesPosition;
      try {
        chess = rules.createPosition(g.initial_fen || g.current_fen);
      } catch {
        chess = rules.createPosition();
      }
      for (const m of ms.slice().sort((a, b) => a.move_number - b.move_number)) {
        // `uci` is Nine64 canonical notation (castle = king start -> king
        // final square), which the rules adapter accepts for every variant.
        const promotion = m.uci.length > 4 ? (m.uci[4] as "q" | "r" | "b" | "n") : undefined;
        try {
          chess.move(m.uci.slice(0, 2), m.uci.slice(2, 4), promotion);
        } catch {
          // ignore invalid moves
        }
      }
      gameRef.current = chess;
      preMoveFenRef.current = null;

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
    async (opts?: { showSpinner?: boolean; full?: boolean }) => {
      if (opts?.showSpinner) setSyncing(true);
      try {
        // One round trip instead of syncGame + getGameMoves, and only the moves
        // this client has not seen yet.
        const known = movesRef.current;
        const since =
          opts?.full || known.length === 0
            ? -1
            : (known[known.length - 1]?.move_number ?? -1);
        const delta = (await syncStateFn({
          data: { gameId, sinceMoveNumber: since },
        })) as GameDelta;
        const merged = delta.full ? delta.moves : [...known, ...delta.moves];
        applyServerState(delta.game, merged, delta.serverNow, delta.activeSide);
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
    [applyServerState, gameId, syncStateFn],
  );

  // Resolve display names for both seats once per game (hot sync path stays lean).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const names = (await getGamePlayersFn({ data: { gameId } })) as {
          whiteName: string;
          blackName: string;
        };
        if (!cancelled) setPlayerNames(names);
      } catch {
        // Fall back to id prefixes — never block the board on a name lookup.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, getGamePlayersFn]);

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
      .channel(uniqueTopic(`game_moves:${gameId}`))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_moves", filter: `game_id=eq.${gameId}` },
        () => {
          void refresh();
        },
      )
      .subscribe(onChannelStatus);

    const gameChannel = supabase
      .channel(uniqueTopic(`game:${gameId}`))
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

  const refreshDraw = useCallback(async () => {
    try {
      const res = (await getDrawOffersFn({ data: { gameId } })) as {
        pending: DrawOffer | null;
        latest: DrawOffer | null;
      };
      setDrawPending(res.pending);
      setDrawLatest(res.latest);
    } catch {
      // Non-fatal: the next sync or realtime event retries.
    }
  }, [gameId, getDrawOffersFn]);

  useEffect(() => {
    void refreshDraw();
  }, [refreshDraw]);

  // Reconnect / refetch must restore a pending offer, so re-read on every sync.
  useEffect(() => {
    if (!game) return;
    void refreshDraw();
  }, [game?.version, game?.status, refreshDraw, game]);

  useEffect(() => {
    if (!gameId) return;
    const ch = supabase
      .channel(uniqueTopic(`draw:${gameId}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_draw_offers", filter: `game_id=eq.${gameId}` },
        () => {
          void refreshDraw();
          void refresh().catch(() => undefined);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [gameId, refresh, refreshDraw]);

  const refreshTakeback = useCallback(async () => {
    try {
      const res = (await getTakebackStateFn({ data: { gameId } })) as {
        pending: TakebackRequest | null;
      };
      setTakebackPending(res.pending);
    } catch {
      // Non-fatal: the next sync retries.
    }
  }, [gameId, getTakebackStateFn]);

  useEffect(() => {
    if (!game?.allow_takeback) return;
    void refreshTakeback();
  }, [game?.allow_takeback, game?.version, refreshTakeback]);

  useEffect(() => {
    if (!gameId || !game?.allow_takeback) return;
    const ch = supabase
      .channel(uniqueTopic(`takeback:${gameId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_takeback_requests",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          void refreshTakeback();
          void refresh().catch(() => undefined);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [game?.allow_takeback, gameId, refresh, refreshTakeback]);

  const runTakeback = useCallback(
    async (kind: "request" | "accept" | "decline" | "cancel") => {
      if (!game || !myColor || takebackBusy) return;
      setTakebackBusy(true);
      try {
        if (kind === "request") {
          await requestTakebackFn({
            data: {
              gameId: game.id,
              expectedVersion: game.version ?? 0,
              idempotencyKey: `takeback:${game.id}:${game.version ?? 0}:${user?.id ?? "anon"}`,
            },
          });
        } else if (takebackPending) {
          await respondTakebackFn({
            data: { gameId: game.id, requestId: takebackPending.id, action: kind },
          });
        }
      } catch {
        toast.error("Không gửi được yêu cầu đòi lại nước.");
      } finally {
        await refreshTakeback();
        await refresh().catch(() => undefined);
        setTakebackBusy(false);
      }
    },
    [
      game,
      myColor,
      refresh,
      refreshTakeback,
      requestTakebackFn,
      respondTakebackFn,
      takebackBusy,
      takebackPending,
      user?.id,
    ],
  );

  /** Presence heartbeat: powers the "opponent disconnected" hint on both sides. */
  useEffect(() => {
    if (!gameId || !myColor || game?.status !== "active") return;
    const beat = async () => {
      try {
        const res = (await touchPresenceFn({ data: { gameId } })) as {
          opponent_seen_at?: string | null;
        };
        setOpponentSeenAt(res.opponent_seen_at ? Date.parse(res.opponent_seen_at) : null);
      } catch {
        // Presence is advisory only.
      }
    };
    void beat();
    const id = window.setInterval(() => void beat(), 15_000);
    return () => window.clearInterval(id);
  }, [game?.status, gameId, myColor, touchPresenceFn]);

  const drawMessage = useCallback((out: DrawCommandOutcome): string | null => {
    switch (out.code) {
      case "OFFER_CREATED":
      case "OFFER_EXISTS":
        return "Đã gửi đề nghị hoà — đang chờ đối thủ phản hồi.";
      case "OFFER_ALREADY_PENDING":
        return "Đã có một đề nghị hoà đang chờ trong ván này.";
      case "OFFER_COOLDOWN":
        return `Vui lòng chờ ${Math.ceil((out.retryAfterMs ?? 30000) / 1000)} giây trước khi đề nghị hoà lại.`;
      case "OFFER_EXPIRED":
        return "Đề nghị hoà đã hết hạn.";
      case "OFFER_NOT_PENDING":
      case "OFFER_ALREADY_RESOLVED":
        return "Đề nghị hoà đã được xử lý.";
      case "DRAW_AGREED":
        return "Hai bên đồng ý hoà.";
      case "DECLINED":
        return "Đã từ chối đề nghị hoà.";
      case "CANCELLED":
        return "Đã rút lại đề nghị hoà.";
      case "STALE_GAME_VERSION":
        return "Thế cờ vừa thay đổi — vui lòng thử lại.";
      default:
        return out.ok ? null : "Không thực hiện được thao tác hoà.";
    }
  }, []);

  const runDraw = useCallback(
    async (kind: "offer" | "accept" | "decline" | "cancel") => {
      if (!game || !myColor || drawBusy) return;
      setDrawBusy(true);
      try {
        let out: DrawCommandOutcome;
        if (kind === "offer") {
          out = (await offerDrawFn({
            data: {
              gameId: game.id,
              expectedVersion: game.version ?? 0,
              // Stable per (game, version, player): a retry never duplicates.
              idempotencyKey: `draw:${game.id}:${game.version ?? 0}:${user?.id ?? "anon"}`,
            },
          })) as DrawCommandOutcome;
        } else {
          const offerId = drawPending?.id;
          if (!offerId) return;
          const fn =
            kind === "accept" ? acceptDrawFn : kind === "decline" ? declineDrawFn : cancelDrawFn;
          out = (await fn({
            data: { gameId: game.id, offerId, expectedVersion: game.version ?? 0 },
          })) as DrawCommandOutcome;
        }
        setDrawNotice(drawMessage(out));
      } catch {
        setDrawNotice("Không kết nối được máy chủ — vui lòng thử lại.");
      } finally {
        await refreshDraw();
        await refresh().catch(() => undefined);
        setDrawBusy(false);
      }
    },
    [
      acceptDrawFn,
      cancelDrawFn,
      declineDrawFn,
      drawBusy,
      drawMessage,
      drawPending?.id,
      game,
      myColor,
      offerDrawFn,
      refresh,
      refreshDraw,
      user?.id,
    ],
  );

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

  // When the estimated countdown hits zero we ask the server to rule on it.
  // The client never declares a winner by itself.
  useEffect(() => {
    if (!awaitingFlag || !game || game.status !== "active") return;
    let cancelled = false;
    const claim = () => {
      if (cancelled) return;
      void runCommand("timeout");
    };
    const id = window.setInterval(claim, 1500);
    claim();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [awaitingFlag, game, runCommand]);



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
          // The commit response already IS the canonical snapshot + the new
          // move, so apply it directly instead of paying another sync round
          // trip right after every move.
          const known = movesRef.current;
          const merged =
            known.some((m) => m.move_number === res.move.move_number)
              ? known
              : [...known, res.move];
          applyServerState(
            res.game,
            merged,
            res.serverNow,
            sideToMoveFromFen(res.game.current_fen),
          );
          return;
        }

        // ---- Rejected: resync canonical state, never blind-retry ----
        setPendingMove(null);
        const label = CONFLICT_LABEL[res.code] ?? "The server rejected that move.";
        await refresh({ showSpinner: true }).catch(() => undefined);
        setConflict(`${label} Board resynced from the server.`);
      } catch (e: unknown) {
        const back = preMoveFenRef.current;
        if (back) {
          try {
            gameRef.current = rulesFor((game.variant ?? "standard") as VariantId).createPosition(back);
          } catch {
            // keep the current position; the refresh below is authoritative
          }
          preMoveFenRef.current = null;
        }
        setLastMove(null);
        setPendingMove(null);
        setBoardRev((v) => v + 1);
        setError(e instanceof Error ? e.message : "Move failed");
        await refresh().catch(() => undefined);
      } finally {
        inFlightRef.current = false;
      }
    },
    [applyServerState, game, makeMoveFn, myColor, refresh],
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
      preMoveFenRef.current = gameRef.current.fen();
      let move: AppliedMove | null = null;
      try {
        move = gameRef.current.move(from, to, promotion ?? undefined);
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



  // Premove: armed while the opponent thinks, replayed the moment the server
  // confirms it is our turn. Illegal premoves are silently discarded.
  useEffect(() => {
    if (!premove) return;
    if (!game || game.status !== "active" || !myColor) return;
    if (gameRef.current.turn() !== myColor) return;
    const armed = premove;
    setPremove(null);
    const legal = (() => {
      try {
        return gameRef.current.legalTargets(armed.from).includes(armed.to);
      } catch {
        return false;
      }
    })();
    if (legal) handleMove(armed.from, armed.to);
  }, [boardRev, game, handleMove, myColor, premove]);

  const canMoveFrom = useCallback(
    (square: string) => {
      if (!myColor || finishedRef.current || game?.status !== "active") return false;
      if (gameRef.current.turn() !== myColor) return false;
      const piece = gameRef.current.pieceAt(square);
      return piece?.color === myColor;
    },
    [game?.status, myColor],
  );

  const legalTargets = useCallback((square: string) => {
    try {
      return gameRef.current.legalTargets(square);
    } catch {
      return [];
    }
  }, []);

  const needsPromotion = useCallback((from: string, to: string) => {
    return gameRef.current.needsPromotion(from, to);
  }, []);

  const pieces = useMemo(() => {
    return gameRef.current.boardPieces();
  }, [moves, result, boardRev]);

  const checkSquare = useMemo(() => {
    if (!gameRef.current.isCheck()) return null;
    return gameRef.current.kingSquare(gameRef.current.turn());
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

  /** Rematch = a direct challenge to the same opponent with the same settings. */
  const requestRematch = useCallback(async () => {
    if (!game || !myColor || rematchBusy) return;
    const opponentId = myColor === "w" ? game.black_id : game.white_id;
    setRematchBusy(true);
    try {
      const out = (await createChallengeFn({
        data: {
          opponentId,
          variant: game.variant,
          timeControl: game.time_control,
          rated: Boolean(game.rated),
          // Colours swap on a rematch.
          color: myColor === "w" ? "black" : "white",
          allowTakeback: Boolean(game.allow_takeback),
          spectate: (game.spectate ?? "public") as "public" | "private",
          rematchOf: game.id,
        },
      })) as { ok: boolean };
      if (out.ok) {
        setRematchSent(true);
        toast.success("Đã gửi lời mời tái đấu.");
      } else {
        toast.error("Không gửi được lời mời tái đấu.");
      }
    } catch {
      toast.error("Không gửi được lời mời tái đấu.");
    } finally {
      setRematchBusy(false);
    }
  }, [createChallengeFn, game, myColor, rematchBusy]);

  const resign = useCallback(() => runCommand("resign"), [runCommand]);
  const abort = useCallback(() => runCommand("abort"), [runCommand]);

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

  const opponentId = myColor === "w" ? game.black_id : game.white_id;
  const opponentName =
    (myColor === "w" ? playerNames?.blackName : playerNames?.whiteName) ??
    opponentId.slice(0, 8);
  const myName =
    (myColor === "w" ? playerNames?.whiteName : playerNames?.blackName) ??
    user?.email?.split("@")[0] ??
    "You";
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
              <StatRow label="Time control" value={timeControlLabel(game.time_control)} mono />
              <StatRow label="Pool" value={game.pool ?? "—"} />
              {game.pace === "daily" && game.deadline_at && live && (
                <StatRow
                  label="Hạn nước đi"
                  value={new Date(game.deadline_at).toLocaleString("vi-VN")}
                />
              )}
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
            {drawPending && game?.status === "active" && (
              <GameNotice tone={drawPending.offered_to === user?.id ? "warning" : "info"}>
                {drawPending.offered_to === user?.id
                  ? "Đối thủ đề nghị hoà — hãy chọn Chấp nhận hoặc Từ chối."
                  : "Đã gửi đề nghị hoà — đang chờ đối thủ phản hồi."}
              </GameNotice>
            )}
            {takebackPending && game?.status === "active" && (
              <GameNotice tone={takebackPending.requested_to === user?.id ? "warning" : "info"}>
                {takebackPending.requested_to === user?.id
                  ? "Đối thủ xin đòi lại nước — bạn có thể đồng ý hoặc từ chối."
                  : "Đã gửi yêu cầu đòi lại nước — đang chờ đối thủ."}
              </GameNotice>
            )}
            {live && opponentSeenAt !== null && Date.now() - opponentSeenAt > 45_000 && (
              <GameNotice tone="warning">
                Đối thủ có vẻ đã mất kết nối. Đồng hồ vẫn chạy theo giờ máy chủ.
              </GameNotice>
            )}
            {!drawPending && drawNotice && game?.status === "active" && (
              <GameNotice tone="info">{drawNotice}</GameNotice>
            )}
            {error && <GameNotice tone="error">{error}</GameNotice>}
            {game.status === "completed" && <ReportPlayerCard gameId={game.id} />}

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
              premove={premove}
              onPremove={(from, to) => setPremove({ from, to })}
              interactive={live}
            />
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

            <GameChatPanel
              gameId={gameId}
              moveSans={moves.map((m) => m.san)}
              ply={moves.length}
              userId={user?.id ?? null}
            />


            {live && (
              <GameActions>
                {drawPending && drawPending.offered_to === user?.id ? (
                  <>
                    <Button
                      variant="default"
                      disabled={drawBusy}
                      onClick={() => void runDraw("accept")}
                    >
                      <Hand className="size-4" /> Chấp nhận hoà
                    </Button>
                    <Button
                      variant="outline"
                      disabled={drawBusy}
                      onClick={() => void runDraw("decline")}
                    >
                      <Ban className="size-4" /> Từ chối hoà
                    </Button>
                  </>
                ) : drawPending ? (
                  <Button
                    variant="outline"
                    disabled={drawBusy}
                    onClick={() => void runDraw("cancel")}
                  >
                    <Hand className="size-4" /> Rút lại đề nghị hoà
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    disabled={drawBusy}
                    onClick={() => void runDraw("offer")}
                  >
                    <Hand className="size-4" /> Cầu hoà
                  </Button>
                )}
                {game.allow_takeback && !game.rated && moves.length > 0 && (
                  takebackPending && takebackPending.requested_to === user?.id ? (
                    <>
                      <Button
                        variant="default"
                        disabled={takebackBusy}
                        onClick={() => void runTakeback("accept")}
                      >
                        <Undo2 className="size-4" /> Đồng ý đòi lại
                      </Button>
                      <Button
                        variant="outline"
                        disabled={takebackBusy}
                        onClick={() => void runTakeback("decline")}
                      >
                        <Ban className="size-4" /> Từ chối
                      </Button>
                    </>
                  ) : takebackPending ? (
                    <Button
                      variant="outline"
                      disabled={takebackBusy}
                      onClick={() => void runTakeback("cancel")}
                    >
                      <Undo2 className="size-4" /> Rút yêu cầu đòi lại
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      disabled={takebackBusy}
                      onClick={() => void runTakeback("request")}
                    >
                      <Undo2 className="size-4" /> Đòi lại nước
                    </Button>
                  )
                )}
                {moves.length === 0 && (
                  <Button variant="outline" disabled={commandBusy} onClick={() => void abort()}>
                    <Ban className="size-4" /> Huỷ ván
                  </Button>
                )}
                <Button variant="outline" disabled={commandBusy} onClick={() => void resign()}>
                  <Flag className="size-4" /> Xin thua
                </Button>
              </GameActions>
            )}

            {!live && myColor && (
              <GameActions>
                <Button disabled={rematchBusy || rematchSent} onClick={() => void requestRematch()}>
                  <Swords className="size-4" />
                  {rematchSent ? "Đã mời tái đấu" : "Tái đấu"}
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


function playMoveSound(game: RulesPosition, move: AppliedMove) {
  if (game.isCheck()) {
    playSound("check");
  } else if (move.promotion) {
    playSound("promotion");
  } else if (move.castle) {
    playSound("castle");
  } else if (move.captured) {
    playSound("capture");
  } else {
    playSound("move");
  }
}
