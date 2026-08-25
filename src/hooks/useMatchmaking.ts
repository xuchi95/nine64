import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { joinQueue, leaveQueue, tryMatch } from "@/lib/online.functions";
import { useAuth } from "@/lib/auth";
import { playSound } from "@/lib/sound";
import { errorDetail, logMmEvent } from "@/lib/matchmaking/diagnostics";
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
  const pollCountRef = useRef(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const cleanup = useCallback(() => {
    if (pollingRef.current) {
      window.clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      logMmEvent("info", "realtime", "Đã đóng kênh realtime hàng chờ");
    }
  }, []);

  const findGameAfterMatch = useCallback(
    async (queue: MatchmakingQueue) => {
      try {
        if (queue.matched_game_id) {
          playSound("matchFound");
          cleanup();
          setState({ kind: "matched", gameId: queue.matched_game_id });
          logMmEvent("info", "navigate", "Ghép trận thành công qua realtime", {
            gameId: queue.matched_game_id,
          });
          void navigate({ to: "/game/$gameId", params: { gameId: queue.matched_game_id } });
          return;
        }
        if (!user?.id) return;
        const { data: rows, error } = await supabase
          .from("games")
          .select("id")
          .or(`white_id.eq.${user.id},black_id.eq.${user.id}`)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1);

        if (error) {
          logMmEvent("error", "rpc", "Không đọc được ván đang diễn ra", errorDetail(error));
        }

        const gameId = rows?.[0]?.id;
        if (gameId) {
          playSound("matchFound");
          cleanup();
          setState({ kind: "matched", gameId });
          logMmEvent("info", "navigate", "Tìm thấy ván đang diễn ra sau khi ghép", { gameId });
          void navigate({ to: "/game/$gameId", params: { gameId } });
        } else {
          logMmEvent("warn", "queue", "Hàng chờ báo đã ghép nhưng chưa thấy ván đấu");
        }
      } catch (e) {
        logMmEvent("error", "queue", "Lỗi khi xử lý sự kiện đã ghép", errorDetail(e));
      }
    },
    [cleanup, navigate, user?.id],
  );

  const startSearch = useCallback(
    async (variant: string, timeControl: string) => {
      if (!user) return;
      cleanup();
      setState({ kind: "idle" });
      pollCountRef.current = 0;
      logMmEvent("info", "queue", "Bắt đầu tìm đối thủ", { variant, timeControl });

      try {
        const entry = (await joinFn({ data: { variant, timeControl } })) as MatchmakingQueue;
        setState({ kind: "searching", queueId: entry.id });
        logMmEvent("info", "queue", "Đã vào hàng chờ", {
          queueId: entry.id,
          rating: entry.rating,
          variant: entry.variant,
          timeControl: entry.time_control,
        });

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
              logMmEvent("info", "realtime", "Nhận cập nhật hàng chờ", {
                status: row.status,
                matchedGameId: row.matched_game_id,
              });
              if (row.status === "matched") {
                void findGameAfterMatch(row);
              }
            },
          )
          .subscribe((status) => {
            const level = status === "SUBSCRIBED" ? "info" : status === "CLOSED" ? "warn" : "error";
            logMmEvent(level, "realtime", `Trạng thái kênh realtime: ${status}`, {
              channel: `queue:${entry.id}`,
            });
          });

        // Fallback polling: try to match every 2 seconds
        const poll = async () => {
          pollCountRef.current += 1;
          const attempt = pollCountRef.current;
          try {
            const { game } = (await matchFn({ data: { queueId: entry.id } })) as { game: Game | null };
            if (game) {
              playSound("matchFound");
              cleanup();
              setState({ kind: "matched", gameId: game.id });
              logMmEvent("info", "rpc", "tryMatch trả về ván đấu", { attempt, gameId: game.id });
              void navigate({ to: "/game/$gameId", params: { gameId: game.id } });
              return;
            }
            logMmEvent("info", "rpc", `tryMatch lần ${attempt}: chưa có đối thủ`, {
              queueId: entry.id,
            });
          } catch (e) {
            logMmEvent("error", "rpc", `tryMatch lần ${attempt} thất bại`, errorDetail(e));
          }
          pollingRef.current = window.setTimeout(poll, 2000);
        };
        void poll();
      } catch (e) {
        setState({ kind: "idle" });
        logMmEvent("error", "queue", "Không vào được hàng chờ", errorDetail(e));
        throw e;
      }
    },
    [cleanup, findGameAfterMatch, joinFn, matchFn, navigate, user],
  );

  const stopSearch = useCallback(async () => {
    cleanup();
    try {
      await leaveFn({ data: undefined });
      logMmEvent("info", "queue", "Đã huỷ tìm đối thủ");
    } catch (e) {
      logMmEvent("error", "queue", "Huỷ hàng chờ thất bại", errorDetail(e));
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
