import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

function format(seconds: number) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  if (s < 20) return `${m}:${rest.toFixed(1).padStart(4, "0")}`;
  return `${m}:${Math.floor(rest).toString().padStart(2, "0")}`;
}

export const Clock = memo(function Clock({
  seconds,
  active,
  enabled = true,
}: {
  seconds: number;
  active: boolean;
  enabled?: boolean;
}) {
  const { t } = useT();
  if (!enabled) {
    return (
      <div className="tabular rounded-md border border-border bg-surface-2 px-3 py-1.5 text-lg tracking-tight text-muted-foreground/70">
        --:--
      </div>
    );
  }
  const low = seconds <= 10;
  return (
    <div
      aria-label={t("game.clock.aria")}
      className={cn(
        "tabular rounded-md border px-3 py-1.5 text-xl font-bold leading-none tracking-tight transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-surface-2 text-muted-foreground",
        low && active && "animate-pulse border-destructive bg-destructive text-destructive-foreground",
      )}
    >
      {format(seconds)}
    </div>
  );
});
