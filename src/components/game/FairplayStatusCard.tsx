import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyFairplayStatus } from "@/lib/fairplay.functions";
import { actionLabel, actionMessage, type FairplayAction } from "@/lib/fairplay/thresholds";
import { formatRemaining, isLockActive, remainingLockMs } from "@/lib/fairplay/lockPolicy";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface StatusRow {
  score: number;
  action: string;
  rating_locked: boolean;
  lock_expires_at: string | null;
  lock_hours: number;
  games_reviewed: number;
  updated_at: string;
}

function isAction(value: string): value is FairplayAction {
  return value === "none" || value === "monitor" || value === "unrated" || value === "rating_hold";
}

/** Player-facing fair play state. Deliberately shows no raw detection signals. */
export function FairplayStatusCard() {
  const { t } = useT();
  const fetchStatus = useServerFn(getMyFairplayStatus);
  const [row, setRow] = useState<StatusRow | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setRow((await fetchStatus()) as StatusRow | null);
      } catch {
        setRow(null);
      } finally {
        setLoaded(true);
      }
    })();
  }, [fetchStatus]);

  if (!loaded) return null;
  const action: FairplayAction = row && isAction(row.action) ? row.action : "none";
  const clean = action === "none";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {clean ? (
            <ShieldCheck className="size-4 text-primary" />
          ) : (
            <ShieldAlert className="size-4 text-destructive" />
          )}
          {t("admin.status.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className={cn("font-medium", clean ? "text-foreground" : "text-destructive")}>
          {actionLabel(action)}
        </p>
        <p className="text-muted-foreground">{actionMessage(action)}</p>
        {row && isLockActive(row) && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {t("admin.status.lockedNotice", {
              remaining: formatRemaining(remainingLockMs(row.lock_expires_at)),
              hours: row.lock_hours
                ? t("admin.status.lockedHoursSuffix", { hours: row.lock_hours })
                : "",
            })}
          </p>
        )}
        <p className="font-mono text-xs text-muted-foreground">
          {t("admin.status.reviewedCount", { n: row?.games_reviewed ?? 0 })}
        </p>
      </CardContent>
    </Card>
  );
}
