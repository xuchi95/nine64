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
import { playSound } from "@/lib/sound";
import { useSettings } from "@/lib/settings";
import type { Game, GameMove } from "@/lib/database.types";
import type { Color } from "@/hooks/useChessGame";
import type { PieceColor } from "@/components/chess/Piece";
import { cn } from "@/lib/utils";
import { Flag, Hand } from "lucide-react";

export const Route = createFileRoute("/_authenticated/game/$gameId")({
  head: () => ({
    meta: [
      { title: `Online game — ${APP.name}` },
      { name: "description", content: "Realtime ranked chess match on Nexus Chess." },
      { property: "og:title", content: `Online game — ${APP.name}` },
      { property: "og:description", content: "Realtime ranked chess match on Nexus Chess." },
    ],
  }),
  component: OnlineGamePage,
});

function timeControlToMs(id: string): number {
  switch (id) {
    case "blitz1m":
      return 60_000;
    case "blitz3m":
      return 180_000;
    case "blitz5m":
      return 300_000;
    case "rapid10m":
      return 600_000;
    case "rapid15m":
      return 900_000;
    case "rapid30m":
      return 1_800_000;
    default:
      return 300_000;
  }
}

function OnlineGamePage() {
  const { gameId } = useParams({ from: "/_authenticated/game/$gameId" });
  const { user } = useAuth();
  const settings = useSettings();
  const getGameFn = useServerFn(getGame);
  const getMovesFn = useServerFn(getGameMoves);
  const makeMoveFn = useServerFn(makeMove);
  const finishGameFn = useServerFn(finishGame);

  const [game, setGame] = useState<Game | null>(null);
  const [moves, setMoves] = useState<GameMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ winner: Color | "draw"; reason: string } | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [clock, setClock] = useState({ w: 0, b: 0 });
  const [boardRev, setBoardRev] = useState(0);
  const gameRef = useRef<Chess>(new Chess());
  const finishedRef = useRef(false);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  const myColor: PieceColor | null = useMemo(() => {
    if (!game || !user) return null;
    if (game.white_id === user.id) return "w";
    if (game.black_id === user.id) return "b";
    return null;
  }, [game, user]);

  const orientation: PieceColor = myColor ?? "w";

  const loadGame = useCallback(async () => {
    try {
      const [g, ms] = await Promise.all([
        getGameFn({ data: { gameId } }) as Promise<Game>,
        getMovesFn({ data: { gameId } }) as Promise<GameMove[]>,
      ]);
      setGame(g);
      setMoves(ms);

      const chess = new Chess();
      try {
        chess.load(g.initial_fen || g.current_fen);
      } catch {
        chess.reset();
      }
      for (const m of ms.sort((a, b) => a.move_number - b.move_number)) {
        try {
          chess.move(m.san);
        } catch {
          // ignore invalid moves
        }
      }
      gameRef.current = chess;
      setClock({ w: g.white_time_ms, b: g.black_time_ms });

      if (ms.length > 0) {
        const last = ms[ms.length - 1]!;
        setLastMove({ from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) });
      }

      if (g.status === "completed") {
        finishedRef.current = true;
        setResult(parseResult(g));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load game");
    } finally {
      setLoading(false);
    }
  }, [gameId, getGameFn, getMovesFn]);

  useEffect(() => {
    void loadGame();
  }, [loadGame]);

  // Realtime subscriptions
  useEffect(() => {
    if (!gameId) return;

    const movesChannel = supabase
      .channel(`game_moves:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_moves", filter: `game_id=eq.${gameId}` },
        (payload) => {
          const move = payload.new as GameMove;
          setMoves((prev) => {
            if (prev.some((m) => m.id === move.id)) return prev;
            return [...prev, move].sort((a, b) => a.move_number - b.move_number);
          });

          // Apply to local chess if it's an opponent move
          if (move.uci) {
            try {
              const m = gameRef.current.move(move.san);
              if (m) {
                setLastMove({ from: m.from, to: m.to });
                playMoveSound(gameRef.current, m);
              }
            } catch {
              // ignore
            }
          }
          setClock({ w: move.white_time_ms, b: move.black_time_ms });
        },
      )
      .subscribe();

    const gameChannel = supabase
      .channel(`game:${gameId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        (payload) => {
          const updated = payload.new as Game;
          setGame(updated);
          setClock({ w: updated.white_time_ms, b: updated.black_time_ms });
          if (updated.status === "completed" && !finishedRef.current) {
            finishedRef.current = true;
            setResult(parseResult(updated));
            playSound(updated.result === "1/2-1/2" ? "draw" : "checkmate");
          }
        },
      )
      .subscribe();

    channelsRef.current = [movesChannel, gameChannel];
    return () => {
      for (const ch of channelsRef.current) void supabase.removeChannel(ch);
    };
  }, [gameId]);

  // Local clock ticking
  useEffect(() => {
    if (!game || game.status !== "active" || finishedRef.current) return;
    const id = window.setInterval(() => {
      const turn = gameRef.current.turn() as "w" | "b";
      setClock((prev) => ({ ...prev, [turn]: Math.max(0, prev[turn] - 100) }));
    }, 100);
    return () => window.clearInterval(id);
  }, [game]);

  const finishIfOver = useCallback(
    async (reason: string, winner: Color | "draw") => {
      if (finishedRef.current || !game) return;
      finishedRef.current = true;
      setResult({ winner, reason });

      let resultCode: "1-0" | "0-1" | "1/2-1/2" | "*" = "*";
      let winnerId: string | null = null;
      if (winner === "w") {
        resultCode = "1-0";
        winnerId = game.white_id;
      } else if (winner === "b") {
        resultCode = "0-1";
        winnerId = game.black_id;
      } else if (winner === "draw") {
        resultCode = "1/2-1/2";
      }

      try {
        await finishGameFn({
          data: {
            gameId: game.id,
            result: resultCode,
            winnerId,
            endReason: reason,
            finalFen: gameRef.current.fen(),
          },
        });
      } catch (e) {
        // ignore; server may have already finished
      }
    },
    [finishGameFn, game],
  );

  const handleMove = useCallback(
    (from: string, to: string, promotion?: "q" | "r" | "b" | "n") => {
      if (!game || !myColor || finishedRef.current) return false;
      if (game.status !== "active") return false;
      if (gameRef.current.turn() !== myColor) return false;

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

      const turnBefore = myColor;
      const previousClock = clock;
      const nextClock = { ...clock };
      // Add increment for the side that just moved
      if (game.time_control.startsWith("rapid15m")) {
        nextClock[turnBefore as "w" | "b"] += 10_000;
      }

      const currentFen = gameRef.current.fen();
      setLastMove({ from: move.from, to: move.to });
      setClock(nextClock);
      playMoveSound(gameRef.current, move);

      // Send to server in background
      makeMoveFn({
        data: {
          gameId: game.id,
          san: move.san,
          uci: `${from}${to}${promotion ?? ""}`,
          fen: currentFen,
          whiteTimeMs: nextClock.w,
          blackTimeMs: nextClock.b,
        },
      })
        .then(() => {
          if (gameRef.current.isCheckmate()) {
            void finishIfOver("Checkmate", myColor);
          } else if (gameRef.current.isDraw()) {
            void finishIfOver("Draw", "draw");
          }
        })
        .catch((e: unknown) => {
          gameRef.current.undo();
          setLastMove(null);
          setClock(previousClock);
          setBoardRev((v) => v + 1);
          setError(e instanceof Error ? e.message : "Move failed");
        });

      return true;
    },
    [clock, finishIfOver, game, makeMoveFn, myColor],
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

  const resign = useCallback(async () => {
    if (!game || !myColor || finishedRef.current) return;
    await finishIfOver("Resignation", myColor === "w" ? "b" : "w");
  }, [finishIfOver, game, myColor]);

  const offerDraw = useCallback(async () => {
    // Simple implementation: immediately draw by agreement for now
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

  if (error || !game) {
    return (
      <AppShell wide>
        <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-muted-foreground">
          <p>{error || "Game not found"}</p>
          <Button onClick={() => void loadGame()}>Retry</Button>
        </div>
      </AppShell>
    );
  }

  const opponentName = myColor === "w" ? game.black_id.slice(0, 8) : game.white_id.slice(0, 8);
  const myName = user?.email?.split("@")[0] ?? "You";

  return (
    <AppShell wide>
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <PlayerBar
            name={opponentName}
            rating={myColor === "w" ? game.black_rating : game.white_rating}
            color={myColor === "w" ? "b" : "w"}
            clock={clock}
            active={gameRef.current.turn() !== myColor && game.status === "active" && !result}
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
              turn={gameRef.current.turn() as PieceColor}
              interactive={game.status === "active" && !result}
            />
          </div>
          <PlayerBar
            name={myName}
            rating={myColor === "w" ? game.white_rating : game.black_rating}
            color={myColor ?? "w"}
            clock={clock}
            active={gameRef.current.turn() === myColor && game.status === "active" && !result}
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
                  game.status === "active" && "bg-green-500/15 text-green-500",
                  game.status === "completed" && "bg-muted text-muted-foreground",
                )}
              >
                {game.status === "active" ? "Live" : "Finished"}
              </span>
            </div>
            {result && (
              <div className="mt-3 rounded-md bg-muted p-3 text-sm">
                <p className="font-semibold">
                  {result.winner === "draw"
                    ? "Draw"
                    : result.winner === myColor
                      ? "You won"
                      : "You lost"}
                </p>
                <p className="text-muted-foreground">{result.reason}</p>
              </div>
            )}
          </Card>

          {!result && game.status === "active" && (
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
            <h3 className="mb-2 text-sm font-semibold">Moves</h3>
            <div className="max-h-[360px] overflow-y-auto font-mono text-sm">
              {moves.length === 0 ? (
                <p className="text-muted-foreground">No moves yet.</p>
              ) : (
                <table className="w-full">
                  <tbody>
                    {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => {
                      const white = moves[i * 2];
                      const black = moves[i * 2 + 1];
                      return (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className="w-10 py-1 text-muted-foreground">{i + 1}.</td>
                          <td className="py-1">{white?.san}</td>
                          <td className="py-1">{black?.san}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
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

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatTimeControl(id: string): string {
  switch (id) {
    case "blitz1m":
      return "1+0";
    case "blitz3m":
      return "3+0";
    case "blitz5m":
      return "5+0";
    case "rapid10m":
      return "10+0";
    case "rapid15m":
      return "15+10";
    case "rapid30m":
      return "30+0";
    default:
      return id;
  }
}

function parseResult(game: Game): { winner: Color | "draw"; reason: string } {
  if (game.result === "1/2-1/2") return { winner: "draw", reason: game.end_reason || "Draw" };
  if (game.result === "1-0") return { winner: "w", reason: game.end_reason || "White wins" };
  if (game.result === "0-1") return { winner: "b", reason: game.end_reason || "Black wins" };
  return { winner: "draw", reason: game.end_reason || "Game over" };
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
