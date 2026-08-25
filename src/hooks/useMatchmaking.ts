import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { joinQueue, leaveQueue, tryMatch } from "@/lib/online.functions";
import { useAuth } from "@/lib/auth";
import { playSound } from "@/lib/sound";
import { errorDetail, logMmEvent } from "@/lib/matchmaking/diagnostics";
import type { Game, MatchmakingQueue } from "@/lib/database.types";

export const MATCH_ACCEPT_SECONDS = 15;

export type MatchOpponent = {
  name: string;
  rating: number | null;
  color: "white" | "black";
};

type MatchmakingState =
  | { kind: "idle" }
  | { kind: "searching"; queueId: string }
  | { kind: "found"; gameId: string; opponent: MatchOpponent | null; deadline: number }
  | { kind: "accepting"; gameId: string; opponent: MatchOpponent | null; deadline: number }
  | { kind: "matched"; gameId: string };

const PENDING_KEY = "nine64.pendingMatch";

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
  const acceptingRef = useRef(false);

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

  const loadOpponent = useCallback(
    async (gameId: string): Promise<MatchOpponent | null> => {
      if (!user?.id) return null;
      try {
        const { data: game, error } = await supabase
          .from("games")
          .select("white_id, black_id, white_rating, black_rating")
          .eq("id", gameId)
          .maybeSingle();
        if (error || !game) return null;

        const isWhite = game.white_id === user.id;
        const opponentId = isWhite ? game.black_id : game.white_id;
        const rating = isWhite ? game.black_rating : game.white_rating;

        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", opponentId)
          .maybeSingle();

        return {
          name: profile?.display_name ?? opponentId.slice(0, 6),
          rating: typeof rating === "number" ? rating : null,
          color: isWhite ? "white" : "black",
        };
      } catch (e) {
        logMmEvent("warn", "queue", "Không tải được thông tin đối thủ", errorDetail(e));
        return null;
      }
    },
    [user?.id],
  );

  /** A match exists: stop searching and ask the player to accept or decline. */
  const presentMatch = useCallback(
    async (gameId: string, via: "realtime" | "rpc") => {
      if (acceptingRef.current) return;
      cleanup();
      playSound("matchFound");
      setState({
        kind: "found",
        gameId,
        opponent: null,
        deadline: Date.now() + MATCH_ACCEPT_SECONDS * 1000,
      });
      logMmEvent("info", "queue", `Đã tìm được đối thủ (qua ${via})`, { gameId });
      const opponent = await loadOpponent(gameId);
      setState((prev) =>
        prev.kind === "found" && prev.gameId === gameId ? { ...prev, opponent } : prev,
      );
    },
    [cleanup, loadOpponent],
  );

  const findGameAfterMatch = useCallback(
    async (queue: MatchmakingQueue) => {
      try {
        if (queue.matched_game_id) {
          await presentMatch(queue.matched_game_id, "realtime");
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
          await presentMatch(gameId, "realtime");
        } else {
          logMmEvent("warn", "queue", "Hàng chờ báo đã ghép nhưng chưa thấy ván đấu");
        }
      } catch (e) {
        logMmEvent("error", "queue", "Lỗi khi xử lý sự kiện đã ghép", errorDetail(e));
      }
    },
    [presentMatch, user?.id],
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
              logMmEvent("info", "rpc", "tryMatch trả về ván đấu", { attempt, gameId: game.id });
              await presentMatch(game.id, "rpc");
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
    [cleanup, findGameAfterMatch, joinFn, matchFn, presentMatch, user],
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

  /**
   * Chốt ván rồi mới chuyển trang: dừng mọi tiến trình tìm kiếm, xác nhận ván
   * đọc được (retry khi mạng/realtime chậm), và luôn điều hướng dù xác nhận lỗi.
   */
  const acceptMatch = useCallback(async () => {
    if (state.kind !== "found" || acceptingRef.current) return;
    const gameId = state.gameId;
    acceptingRef.current = true;
    cleanup();
    setState({ kind: "accepting", gameId, opponent: state.opponent, deadline: state.deadline });
    try {
      window.sessionStorage.setItem(PENDING_KEY, gameId);
    } catch {
      /* storage bị chặn: bỏ qua */
    }
    logMmEvent("info", "navigate", "Đã đồng ý, đang chốt ván", { gameId });

    let confirmed = false;
    for (let attempt = 1; attempt <= 3 && !confirmed; attempt += 1) {
      try {
        const { data, error } = await supabase
          .from("games")
          .select("id, status")
          .eq("id", gameId)
          .maybeSingle();
        if (!error && data?.id) confirmed = true;
        else if (error) logMmEvent("warn", "rpc", `Chốt ván lần ${attempt} lỗi`, errorDetail(error));
      } catch (e) {
        logMmEvent("warn", "rpc", `Chốt ván lần ${attempt} thất bại`, errorDetail(e));
      }
      if (!confirmed && attempt < 3) await new Promise((r) => window.setTimeout(r, 400 * attempt));
    }

    logMmEvent(confirmed ? "info" : "warn", "navigate", confirmed
      ? "Ván đã sẵn sàng, vào bàn"
      : "Chưa xác nhận được ván, vẫn vào bàn để trang ván tự tải lại", { gameId });

    setState({ kind: "matched", gameId });
    acceptingRef.current = false;
    await navigate({ to: "/game/$gameId", params: { gameId } });
    try {
      window.sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* bỏ qua */
    }
  }, [cleanup, navigate, state]);

  /**
   * Từ chối: huỷ ván, đưa đối thủ trở lại hàng chờ, rồi tự vào lại hàng chờ
   * với đúng biến thể/kiểm soát thời gian đã chọn.
   */
  const declineMatch = useCallback(async () => {
    if (state.kind !== "found" || acceptingRef.current) return;
    const gameId = state.gameId;
    logMmEvent("warn", "queue", "Đã từ chối ván vừa ghép", { gameId });
    cleanup();
    setState({ kind: "idle" });

    let variant = searchConfigRef.current?.variant ?? null;
    let timeControl = searchConfigRef.current?.timeControl ?? null;
    try {
      const res = (await declineFn({ data: { gameId } })) as {
        variant: string;
        timeControl: string;
      };
      variant = res.variant ?? variant;
      timeControl = res.timeControl ?? timeControl;
      logMmEvent("info", "queue", "Đã huỷ ván và trả đối thủ về hàng chờ", { gameId });
    } catch (e) {
      logMmEvent("error", "queue", "Huỷ ván sau khi từ chối thất bại", errorDetail(e));
      try {
        await leaveFn({ data: undefined });
      } catch (err) {
        logMmEvent("error", "queue", "Dọn hàng chờ thất bại", errorDetail(err));
      }
    }

    if (variant && timeControl) {
      try {
        await startSearch(variant, timeControl);
      } catch (e) {
        logMmEvent("error", "queue", "Không vào lại được hàng chờ", errorDetail(e));
      }
    }
  }, [cleanup, declineFn, leaveFn, startSearch, state]);

  // Nếu đối thủ từ chối, ván bị huỷ: tự đưa mình trở lại hàng chờ.
  useEffect(() => {
    if (state.kind !== "found") return;
    const gameId = state.gameId;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      const { data } = await supabase
        .from("games")
        .select("status, variant, time_control")
        .eq("id", gameId)
        .maybeSingle();
      if (cancelled || !data || data.status !== "aborted") return;
      window.clearInterval(timer);
      logMmEvent("warn", "queue", "Đối thủ đã từ chối, quay lại hàng chờ", { gameId });
      setState({ kind: "idle" });
      const variant = data.variant ?? searchConfigRef.current?.variant;
      const timeControl = data.time_control ?? searchConfigRef.current?.timeControl;
      if (variant && timeControl) {
        try {
          await startSearch(variant, timeControl);
        } catch (e) {
          logMmEvent("error", "queue", "Không vào lại được hàng chờ", errorDetail(e));
        }
      }
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [startSearch, state]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);


  return {
    state,
    startSearch,
    stopSearch,
    acceptMatch,
    declineMatch,
  };
}
