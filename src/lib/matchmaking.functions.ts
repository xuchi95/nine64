import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MmQueueRow = {
  id: string;
  variant: string;
  timeControl: string;
  rating: number;
  status: string;
  matchedGameId: string | null;
  createdAt: string;
  updatedAt: string;
  waitedSeconds: number;
};

export type MmPoolEntry = {
  isMe: boolean;
  rating: number;
  waitedSeconds: number;
  ratingGap: number | null;
  withinWindow: boolean | null;
};

export type MmPoolSummary = {
  variant: string;
  timeControl: string;
  waiting: number;
};

export type MmDiagnostics = {
  now: string;
  myQueue: MmQueueRow[];
  activeEntry: MmQueueRow | null;
  ratingWindow: number | null;
  pool: MmPoolEntry[];
  pools: MmPoolSummary[];
  activeGameId: string | null;
  stuckReasons: string[];
};

const ratingWindowFor = (waitedSeconds: number) =>
  Math.min(800, 120 + Math.floor(waitedSeconds / 3) * 80);

export const getMatchmakingDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MmDiagnostics> => {
    const supabase = context.supabase;
    const now = Date.now();

    const { data: mine, error: mineError } = await supabase
      .from("matchmaking_queue")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (mineError) throw new Error(mineError.message);

    const toRow = (r: Record<string, unknown>): MmQueueRow => {
      const createdAt = String(r["created_at"]);
      return {
        id: String(r["id"]),
        variant: String(r["variant"]),
        timeControl: String(r["time_control"]),
        rating: Number(r["rating"] ?? 0),
        status: String(r["status"]),
        matchedGameId: (r["matched_game_id"] as string | null) ?? null,
        createdAt,
        updatedAt: String(r["updated_at"] ?? createdAt),
        waitedSeconds: Math.max(0, Math.round((now - new Date(createdAt).getTime()) / 1000)),
      };
    };

    const myQueue = ((mine ?? []) as Record<string, unknown>[]).map(toRow);
    const activeEntry = myQueue.find((r) => r.status === "waiting") ?? null;

    const { data: activeGames } = await supabase
      .from("games")
      .select("id")
      .or(`white_id.eq.${context.userId},black_id.eq.${context.userId}`)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1);
    const activeGameId = (activeGames?.[0]?.id as string | undefined) ?? null;

    // Pool visibility needs rows owned by other players, which RLS hides from
    // the caller. Read them with the privileged client but return only
    // anonymized rating/wait figures — never user ids.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: waitingRows, error: waitingError } = await supabaseAdmin
      .from("matchmaking_queue")
      .select("user_id, rating, variant, time_control, created_at")
      .eq("status", "waiting")
      .order("created_at", { ascending: true })
      .limit(200);

    if (waitingError) throw new Error(waitingError.message);

    const rows = (waitingRows ?? []) as Record<string, unknown>[];

    const poolMap = new Map<string, MmPoolSummary>();
    for (const r of rows) {
      const key = `${String(r["variant"])}|${String(r["time_control"])}`;
      const existing = poolMap.get(key);
      if (existing) existing.waiting += 1;
      else
        poolMap.set(key, {
          variant: String(r["variant"]),
          timeControl: String(r["time_control"]),
          waiting: 1,
        });
    }

    const ratingWindow = activeEntry ? ratingWindowFor(activeEntry.waitedSeconds) : null;

    const pool: MmPoolEntry[] = activeEntry
      ? rows
          .filter(
            (r) =>
              String(r["variant"]) === activeEntry.variant &&
              String(r["time_control"]) === activeEntry.timeControl,
          )
          .map((r) => {
            const rating = Number(r["rating"] ?? 0);
            const isMe = String(r["user_id"]) === context.userId;
            const gap = isMe ? null : Math.abs(rating - activeEntry.rating);
            return {
              isMe,
              rating,
              waitedSeconds: Math.max(
                0,
                Math.round((now - new Date(String(r["created_at"])).getTime()) / 1000),
              ),
              ratingGap: gap,
              withinWindow: gap === null ? null : gap <= (ratingWindow ?? 0),
            };
          })
          .sort((a, b) => (a.ratingGap ?? -1) - (b.ratingGap ?? -1))
      : [];

    const stuckReasons: string[] = [];
    if (!activeEntry) {
      stuckReasons.push("no_waiting_entry");
    } else {
      const others = pool.filter((p) => !p.isMe);
      if (others.length === 0) stuckReasons.push("empty_pool");
      else if (!others.some((p) => p.withinWindow)) stuckReasons.push("rating_window_too_narrow");
      if (myQueue.filter((r) => r.status === "waiting").length > 1)
        stuckReasons.push("duplicate_waiting_entries");
      if (activeEntry.matchedGameId) stuckReasons.push("matched_but_still_waiting");
      if (activeGameId) stuckReasons.push("active_game_already_exists");
    }

    return {
      now: new Date(now).toISOString(),
      myQueue,
      activeEntry,
      ratingWindow,
      pool,
      pools: [...poolMap.values()].sort((a, b) => b.waiting - a.waiting),
      activeGameId,
      stuckReasons,
    };
  });
