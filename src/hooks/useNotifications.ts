import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getNotifications, markNotificationRead } from "@/lib/online.functions";
import { useAuth } from "@/lib/auth";
import { playSound } from "@/lib/sound";
import type { Notification } from "@/lib/database.types";

export function useNotifications() {
  const { user } = useAuth();
  const getFn = useServerFn(getNotifications);
  const readFn = useServerFn(markNotificationRead);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const data = (await getFn({ data: undefined })) as Notification[];
      setNotifications(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [getFn, user]);

  const markRead = useCallback(
    async (id: string) => {
      try {
        await readFn({ data: { id } });
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      } catch {
        // ignore
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
          setNotifications((prev) => [notification, ...prev]);
          playSound("notification");
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, loading, refresh, markRead, markAllRead };
}
