import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyGames, getGameMoves, getGame } from "@/lib/online.functions";
import type { Game, GameMove } from "@/lib/database.types";

export interface OnlineGameDetail extends Game {
  moves: GameMove[];
}

export function useOnlineGames() {
  const getGamesFn = useServerFn(getMyGames);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getGamesFn({ data: undefined })
      .then((data) => {
        if (!cancelled) setGames(data as Game[]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getGamesFn]);

  return { games, loading, refresh: () => void getGamesFn({ data: undefined }).then((d) => setGames(d as Game[])) };
}

export function useOnlineGame(gameId: string) {
  const getGameFn = useServerFn(getGame);
  const getMovesFn = useServerFn(getGameMoves);
  const [game, setGame] = useState<OnlineGameDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getGameFn({ data: { gameId } }) as Promise<Game>,
      getMovesFn({ data: { gameId } }) as Promise<GameMove[]>,
    ])
      .then(([g, moves]) => {
        if (!cancelled) setGame({ ...g, moves: moves.sort((a, b) => a.move_number - b.move_number) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, getGameFn, getMovesFn]);

  return {
    game,
    loading,
    refresh: () =>
      void getGameFn({ data: { gameId } }).then((g: unknown) =>
        setGame((prev) => (prev ? { ...prev, ...(g as Game) } : null)),
      ),
  };
}
