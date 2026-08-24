import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { joinQueue, leaveQueue, tryMatch } from "@/lib/online.functions";
import { useAuth } from "@/lib/auth";
import { playSound } from "@/lib/sound";
import type { Game, MatchmakingQueue } from "@/lib/database.types";

type MatchmakingState =
  | { kind: "idle" }
  | { kind: "searching"; queueId: string }
  | { kind: "matched"; gameId: string };

export function useMatchmaking() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const joinFn = useServerFn(joinQueue);
  const leaveFn = useServerFn(leaveQueue);
  const matchFn = useServerFn(tryMatch);
  const [state, setState] = useState<MatchmakingState>({ kind: "idle" });
  const pollingRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const cleanup = useCallback(() => {
    if (pollingRef.current) {
      window.clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const startSearch = useCallback(
    async (variant: string, timeControl: string) => {
      if (!user) return;
      cleanup();
      setState({ kind: "idle" });

      try {
        const entry = (await joinFn({ data: { variant, timeControl } })) as MatchmakingQueue;
        setState({ kind: "searching", queueId: entry.id });

        // Subscribe to our own queue row for realtime status changes
        channelRef.current = supabase
          .channel(`queue:${entry.id}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "matchmaking_queue",
              filter: `id=eq.${entry.id}`,
            },
            (payload) => {
              const row = payload.new as MatchmakingQueue;
              if (row.status === "matched") {
                // The game was created by the server; we need to find it.
                void findGameAfterMatch(entry.id);
              }
            },
          )
          .subscribe();

        // Fallback polling: try to match every 2 seconds
        const poll = async () => {
          try {
            const { game } = (await matchFn({ data: { queueId: entry.id } })) as { game: Game | null };
            if (game) {
              playSound("matchFound");
              cleanup();
              setState({ kind: "matched", gameId: game.id });
              void navigate({ to: "/game/$gameId", params: { gameId: game.id } });
              return;
            }
          } catch {
            // ignore transient errors
          }
          pollingRef.current = window.setTimeout(poll, 2000);
        };
        pollingRef.current = window.setTimeout(poll, 1500);
      } catch (e) {
        setState({ kind: "idle" });
        throw e;
      }
    },
    [cleanup, joinFn, leaveFn, matchFn, navigate, user],
  );

  const findGameAfterMatch = useCallback(
    async (queueId: string) => {
      try {
        const { data: rows } = await supabase
          .from("games")
          .select("id")
          .or(`white_id.eq.${user?.id},black_id.eq.${user?.id}`)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1);

        const gameId = rows?.[0]?.id;
        if (gameId) {
          playSound("matchFound");
          cleanup();
          setState({ kind: "matched", gameId });
          void navigate({ to: "/game/$gameId", params: { gameId } });
        }
      } catch {
        // ignore
      }
    },
    [cleanup, navigate, user?.id],
  );

  const stopSearch = useCallback(async () => {
    cleanup();
    try {
      await leaveFn({ data: undefined });
    } catch {
      // ignore
    }
    setState({ kind: "idle" });
  }, [cleanup, leaveFn]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    state,
    startSearch,
    stopSearch,
  };
}
