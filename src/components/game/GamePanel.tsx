import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export function GamePanel({
  title,
  meta,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      data-game-panel=""
      className={cn(
        "panel group/panel flex flex-col overflow-hidden transition-[border-color,box-shadow,transform] duration-300 ease-out hover:-translate-y-[1px] hover:border-primary/30 hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none",
        className,
      )}>

      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-border bg-surface-2/60 px-4 py-2 transition-colors duration-300 group-hover/panel:bg-surface-2">
          <h2 className="text-2xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {title}
          </h2>
          {meta && <span className="text-2xs font-medium text-muted-foreground">{meta}</span>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "max-w-[62%] truncate text-right text-sm font-semibold text-foreground",
          mono && "tabular",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Horizontal eval bar. `score` in pawns, positive = white better. */
export function EvalBar({ score, label }: { score: number | null; label: string }) {
  const { t } = useT();
  const clamped = score === null ? 0 : Math.max(-6, Math.min(6, score));
  const pct = score === null ? 50 : 50 + (clamped / 6) * 50;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("game.evalBar.label")}
        </span>
        <span className="tabular text-xs font-bold text-primary">{label}</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full border border-border/60 bg-surface-2">
        <div
          className="h-full bg-primary transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
      </div>
    </div>
  );
}
