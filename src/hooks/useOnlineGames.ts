import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyGames, getGameMoves, getGame } from "@/lib/online.functions";
import type { Game, GameMove } from "@/lib/database.types";
import { useAuth } from "@/lib/auth";

export interface OnlineGameDetail extends Game {
  moves?: GameMove[];
}

export function useOnlineGames() {
  const getGamesFn = useServerFn(getMyGames);
  const { user, isLoading: authLoading } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!user) {
      setGames([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getGamesFn({ data: undefined })
      .then((data) => {
        if (!cancelled) setGames(data as Game[]);
      })
      .catch(() => {
        if (!cancelled) setGames([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getGamesFn, user, authLoading]);

  return {
    games,
    loading,
    refresh: () => {
      if (!user) return;
      void getGamesFn({ data: undefined })
        .then((d) => setGames(d as Game[]))
        .catch(() => setGames([]));
    },
  };
}

export function useOnlineGame(gameId: string) {
  const { user, isLoading: authLoading } = useAuth();
  const getGameFn = useServerFn(getGame);
  const getMovesFn = useServerFn(getGameMoves);
  const [game, setGame] = useState<OnlineGameDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!user) {
      setGame(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      getGameFn({ data: { gameId } }) as Promise<Game>,
      getMovesFn({ data: { gameId } }) as Promise<GameMove[]>,
    ])
      .then(([g, moves]) => {
        if (!cancelled) setGame({ ...g, moves: moves.sort((a, b) => a.move_number - b.move_number) });
      })
      .catch(() => {
        if (!cancelled) setGame(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, getGameFn, getMovesFn, user, authLoading]);

  return {
    game,
    loading,
    refresh: () => {
      if (!user) return;
      void getGameFn({ data: { gameId } })
        .then((g: unknown) => setGame((prev) => (prev ? { ...prev, ...(g as Game) } : null)))
        .catch(() => undefined);
    },
  };
}
