import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { formatClock, formatDuration } from "@/lib/chess/timeControls";
import { gameLabelClass } from "./GameLayout";

export interface JournalEntry {
  /** 1-based ply index. */
  ply: number;
  san: string;
  color: "w" | "b";
  /** Clock remaining for the mover after the move, if known. */
  clockMs?: number | null;
  /** Time spent on this move, if computable. */
  spentMs?: number | null;
  at?: string | null;
  pending?: boolean;
}

export interface MoveJournalProps {
  entries: JournalEntry[];
  statusLine?: string;
  footer?: React.ReactNode;
  className?: string;
}

export function MoveJournal({ entries, statusLine, footer, className }: MoveJournalProps) {
  const { t } = useT();
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className={gameLabelClass}>{t("game.journal.liveLog")}</span>
        <span className="tabular text-xs font-semibold text-muted-foreground">
          {t("game.journal.pliesCount", { n: entries.length })}
        </span>
      </div>

      <div ref={scroller} className="max-h-[320px] overflow-y-auto pr-1">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("game.journal.empty")}
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {entries.map((e) => (
              <li
                key={`${e.ply}-${e.san}`}
                className={cn(
                  "flex items-center gap-2 rounded px-2 py-1",
                  e.ply % 2 === 1 ? "bg-surface-2/40" : "bg-transparent",
                  e.pending && "opacity-60",
                )}
              >
                <span className="tabular w-8 text-xs text-muted-foreground">
                  {Math.ceil(e.ply / 2)}
                  {e.color === "w" ? "." : "…"}
                </span>
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full text-2xs font-bold",
                    e.color === "w"
                      ? "bg-foreground text-background"
                      : "bg-surface-2 text-foreground ring-1 ring-border",
                  )}
                >
                  {e.color === "w" ? "W" : "B"}
                </span>
                <span className="tabular flex-1 text-sm font-semibold">{e.san}</span>
                {e.spentMs != null && (
                  <span className="tabular text-xs text-muted-foreground">
                    {formatDuration(e.spentMs)}
                  </span>
                )}
                {e.clockMs != null && (
                  <span className="tabular w-14 text-right text-xs text-muted-foreground">
                    {formatClock(e.clockMs)}
                  </span>
                )}
                {e.pending && <span className="text-2xs font-bold uppercase tracking-[0.12em] text-warning">
                    {t("game.journal.sending")}
                  </span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {statusLine && (
        <p className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          {statusLine}
        </p>
      )}
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}

/** Build journal entries from stored moves + clock snapshots. */
export function buildJournalEntries(
  moves: Array<{
    move_number: number;
    san: string;
    white_time_ms: number;
    black_time_ms: number;
    created_at?: string | null;
  }>,
  opts: { baseMs: number; incrementMs: number },
): JournalEntry[] {
  const prevClock: Record<"w" | "b", number> = { w: opts.baseMs, b: opts.baseMs };
  return moves
    .slice()
    .sort((a, b) => a.move_number - b.move_number)
    .map((m) => {
      const color: "w" | "b" = m.move_number % 2 === 1 ? "w" : "b";
      const clockMs = color === "w" ? m.white_time_ms : m.black_time_ms;
      const before = prevClock[color];
      const spentMs = Math.max(0, before + opts.incrementMs - clockMs);
      prevClock[color] = clockMs;
      return {
        ply: m.move_number,
        san: m.san,
        color,
        clockMs,
        spentMs,
        at: m.created_at ?? null,
      };
    });
}
