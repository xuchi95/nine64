import { Wifi, WifiOff, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SyncMode = "connecting" | "realtime" | "fallback" | "offline";

export interface ConnectionStatusProps {
  mode: SyncMode;
  lastSyncAt: number | null;
  syncing?: boolean;
  onRefresh?: () => void;
  className?: string;
}

const COPY: Record<SyncMode, { label: string; detail: string; tone: string }> = {
  connecting: {
    label: "Connecting…",
    detail: "Opening the realtime channel for this game.",
    tone: "bg-amber-500/15 text-amber-400",
  },
  realtime: {
    label: "Realtime",
    detail: "Moves and clocks arrive instantly for both players.",
    tone: "bg-emerald-500/15 text-emerald-400",
  },
  fallback: {
    label: "Backup sync",
    detail: "Realtime is unavailable — polling the server every 2.5s instead.",
    tone: "bg-amber-500/15 text-amber-400",
  },
  offline: {
    label: "Disconnected",
    detail: "No connection to the server. Reconnecting automatically.",
    tone: "bg-destructive/15 text-destructive",
  },
};

function ago(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 2) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export function ConnectionStatus({
  mode,
  lastSyncAt,
  syncing,
  onRefresh,
  className,
}: ConnectionStatusProps) {
  const copy = COPY[mode];
  const Icon = mode === "realtime" ? Wifi : mode === "offline" ? WifiOff : RefreshCw;

  return (
    <div
      className={cn(
        "rounded-md border border-border/70 bg-surface-1 p-3 text-sm",
        mode === "offline" && "border-destructive/40",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium",
            copy.tone,
          )}
        >
          <Icon className={cn("size-3.5", mode === "fallback" && "animate-spin")} />
          {copy.label}
        </span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">synced {ago(lastSyncAt)}</span>
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
