import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { formatClock, formatDuration } from "@/lib/chess/timeControls";

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
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Live move log</h3>
        <span className="font-mono text-xs text-muted-foreground">{entries.length} plies</span>
      </div>

      <div ref={scroller} className="max-h-[320px] overflow-y-auto pr-1">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No moves yet — the log updates for both players after every move.
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
                <span className="w-8 font-mono text-xs text-muted-foreground">
                  {Math.ceil(e.ply / 2)}
                  {e.color === "w" ? "." : "…"}
                </span>
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full text-[9px] font-bold",
                    e.color === "w"
                      ? "bg-white text-black"
                      : "bg-black text-white ring-1 ring-white/20",
                  )}
                >
                  {e.color === "w" ? "W" : "B"}
                </span>
                <span className="flex-1 font-mono font-medium">{e.san}</span>
                {e.spentMs != null && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDuration(e.spentMs)}
                  </span>
                )}
                {e.clockMs != null && (
                  <span className="w-14 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {formatClock(e.clockMs)}
                  </span>
                )}
                {e.pending && <span className="text-[10px] uppercase text-amber-400">sending</span>}
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
