import { useEffect, useRef } from "react";
import type { MoveRecord } from "@/hooks/useChessGame";
import { cn } from "@/lib/utils";

export function MoveList({
  moves,
  activeIndex,
  onSelect,
}: {
  moves: MoveRecord[];
  activeIndex?: number;
  onSelect?: (index: number) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [moves.length]);

  if (moves.length === 0) {
    return (
      <div className="flex h-full min-h-24 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
        No moves yet. White to start.
      </div>
    );
  }

  const pairs: { no: number; white?: MoveRecord; black?: MoveRecord; wi: number; bi: number }[] = [];
  moves.forEach((m, i) => {
    const no = Math.floor(i / 2) + 1;
    if (i % 2 === 0) pairs.push({ no, white: m, wi: i, bi: -1 });
    else {
      const last = pairs[pairs.length - 1]!;
      last.black = m;
      last.bi = i;
    }
  });

  return (
    <div className="max-h-full overflow-y-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="text-left text-2xs uppercase tracking-[0.16em] text-muted-foreground">
            <th className="w-10 px-3 py-1.5 font-semibold">#</th>
            <th className="px-3 py-1.5 font-semibold">White</th>
            <th className="px-3 py-1.5 font-semibold">Black</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((p, idx) => (
            <tr key={p.no} className={cn(idx % 2 === 0 && "bg-surface-2/50")}>
              <td className="tabular w-10 px-3 py-0.5 text-xs text-muted-foreground/70">{p.no}</td>
              <td className="py-0.5 pr-1">
                <MoveCell record={p.white ?? null} index={p.wi} active={activeIndex === p.wi} onSelect={onSelect} />
              </td>
              <td className="py-0.5 pr-1">
                <MoveCell record={p.black ?? null} index={p.bi} active={activeIndex === p.bi} onSelect={onSelect} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div ref={endRef} />
    </div>
  );
}

function MoveCell({
  record,
  index,
  active,
  onSelect,
}: {
  record: MoveRecord | null;
  index: number;
  active?: boolean | undefined;
  onSelect?: ((index: number) => void) | undefined;
}) {
  if (!record) return <span className="px-2 text-muted-foreground/50">—</span>;
  return (
    <button
      type="button"
      onClick={() => onSelect?.(index)}
      className={cn(
        "tabular w-full rounded px-2 py-1 text-left text-sm font-semibold transition-colors hover:bg-secondary",
        active && "bg-primary/15 text-primary",
      )}
    >
      {record.san}
    </button>
  );
}
