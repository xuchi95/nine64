import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared in-game design system primitives. Every play surface (bot, local,
 * online) composes these so colours, typography and spacing stay identical.
 */

/** Uppercase micro-label used by every in-game header/eyebrow. */
export const gameLabelClass =
  "text-2xs font-bold uppercase tracking-[0.18em] text-muted-foreground";

/** Three-column play layout: info rail, board, notation rail. */
export function GameLayout({
  left,
  board,
  right,
}: {
  left: ReactNode;
  board: ReactNode;
  right: ReactNode;
}) {
  return (
    <div className="grid w-full max-w-full gap-4 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
      <div className="order-2 min-w-0 space-y-3 lg:order-1">{left}</div>
      <div className="order-1 min-w-0 lg:order-2">
        <div className="mx-auto w-full max-w-[720px] space-y-3">{board}</div>
      </div>
      <div className="order-3 min-w-0 space-y-3 lg:order-3">{right}</div>
    </div>

  );
}

/** Consistent button cluster spacing for resign / draw / rematch groups. */
export function GameActions({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        columns === 2 ? "grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type StatusTone = "live" | "win" | "loss" | "draw" | "neutral";

/** Small state pill (Live / Win / Draw …) with shared tone colours. */
export function StatusPill({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded px-2 py-0.5 text-2xs font-bold uppercase tracking-[0.12em]",
        tone === "live" && "bg-primary/15 text-primary",
        tone === "win" && "bg-success/15 text-success",
        tone === "loss" && "bg-destructive/15 text-destructive",
        tone === "draw" && "bg-muted text-muted-foreground",
        tone === "neutral" && "bg-surface-2 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** Inline notice (info / warning / error) shown inside the rails. */
export function GameNotice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "error";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-xs font-medium",
        tone === "info" && "border-border bg-surface-2 text-muted-foreground",
        tone === "warning" && "border-warning/40 bg-warning/10 text-warning",
        tone === "error" && "border-destructive/50 bg-destructive/10 text-destructive",
      )}
    >
      {children}
    </div>
  );
}

