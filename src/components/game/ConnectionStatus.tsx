import { Wifi, WifiOff, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT, type TFunction } from "@/lib/i18n";

export type SyncMode = "connecting" | "realtime" | "fallback" | "offline";

export interface ConnectionStatusProps {
  mode: SyncMode;
  lastSyncAt: number | null;
  syncing?: boolean;
  onRefresh?: () => void;
  className?: string;
}

function copyFor(mode: SyncMode, t: TFunction): { label: string; detail: string; tone: string } {
  switch (mode) {
    case "connecting":
      return {
        label: t("game.connection.connecting.label"),
        detail: t("game.connection.connecting.detail"),
        tone: "bg-warning/15 text-warning",
      };
    case "realtime":
      return {
        label: t("game.connection.realtime.label"),
        detail: t("game.connection.realtime.detail"),
        tone: "bg-success/15 text-success",
      };
    case "fallback":
      return {
        label: t("game.connection.fallback.label"),
        detail: t("game.connection.fallback.detail"),
        tone: "bg-warning/15 text-warning",
      };
    case "offline":
      return {
        label: t("game.connection.offline.label"),
        detail: t("game.connection.offline.detail"),
        tone: "bg-destructive/15 text-destructive",
      };
  }
}

function ago(ts: number | null, t: TFunction): string {
  if (!ts) return t("game.connection.syncedNever");
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 2) return t("game.connection.syncedJustNow");
  if (s < 60) return t("game.connection.syncedSecondsAgo", { n: s });
  return t("game.connection.syncedMinutesAgo", { n: Math.floor(s / 60) });
}

export function ConnectionStatus({
  mode,
  lastSyncAt,
  syncing,
  onRefresh,
  className,
}: ConnectionStatusProps) {
  const { t } = useT();
  const copy = copyFor(mode, t);
  const Icon = mode === "realtime" ? Wifi : mode === "offline" ? WifiOff : RefreshCw;

  return (
    <div
      className={cn(
        "panel p-3 text-sm",
        mode === "offline" && "border-destructive/40",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-2xs font-bold uppercase tracking-[0.12em]",
            copy.tone,
          )}
        >
          <Icon className={cn("size-3.5", mode === "fallback" && "animate-spin")} />
          {copy.label}
        </span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular">{t("game.connection.syncedPrefix", { ago: ago(lastSyncAt, t) })}</span>
          {onRefresh && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2"
              onClick={onRefresh}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{copy.detail}</p>
    </div>
  );
}
