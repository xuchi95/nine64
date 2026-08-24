import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { syncHistory } from "@/lib/historySync";

/**
 * Reconciles the local offline archive with the signed-in account once per
 * session: local-only games are uploaded, account-only games are merged down.
 */
export function HistorySyncBridge() {
  const { user } = useAuth();
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id;
    if (!userId || syncedFor.current === userId) return;
    syncedFor.current = userId;
    void syncHistory(userId)
      .then(({ pushed, pulled }) => {
        if (pushed > 0 || pulled > 0) {
          toast.success("Archive synced", {
            description: `${pushed} game${pushed === 1 ? "" : "s"} uploaded · ${pulled} restored from your account.`,
          });
        }
      })
      .catch(() => {
        syncedFor.current = null;
      });
  }, [user?.id]);

  return null;
}
