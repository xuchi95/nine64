import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getNotifications, markNotificationRead } from "@/lib/online.functions";
import { useAuth } from "@/lib/auth";
import { playSound } from "@/lib/sound";
import type { Notification } from "@/lib/database.types";

/**
 * Notifications are produced server-side by the transactional outbox. The hook
 * only reads: it deduplicates realtime vs refetch, marks read optimistically
 * with rollback, and resyncs on reconnect/focus so nothing is silently lost.
 */
function dedupe(list: Notification[]): Notification[] {
  const seen = new Set<string>();
  const out: Notification[] = [];
  for (const n of list) {
    // event_key is the canonical identity; fall back to the row id.
    const key = n.event_key ? `${n.user_id}:${n.event_key}` : n.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

export function useNotifications() {
  const { user } = useAuth();
  const getFn = useServerFn(getNotifications);
  const readFn = useServerFn(markNotificationRead);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!user || inFlight.current) return;
    inFlight.current = true;
    try {
      const data = (await getFn({ data: undefined })) as Notification[];
      setNotifications(dedupe(data));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "notifications_unavailable");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [getFn, user]);

  const markRead = useCallback(
    async (id: string) => {
      let previous: Notification[] = [];
      setNotifications((prev) => {
        previous = prev;
        return prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      });
      try {
        await readFn({ data: { id } });
        setError(null);
      } catch (err) {
        setNotifications(previous); // rollback
        setError(err instanceof Error ? err.message : "mark_read_failed");
      }
    },
    [readFn],
  );

  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(unread.map((n) => markRead(n.id)));
  }, [markRead, notifications]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    void refresh();

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const notification = payload.new as Notification;
          setNotifications((prev) => {
            const next = dedupe([notification, ...prev]);
            if (next.length === prev.length) return prev; // duplicate delivery
            return next;
          });
          playSound("notification");
        },
      )
      .subscribe((status) => {
        // A resubscribe after a dropped socket may have missed inserts.
        if (status === "SUBSCRIBED") void refresh();
      });

    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("online", onFocus);

    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("online", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [refresh, user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, loading, error, refresh, markRead, markAllRead };
}
