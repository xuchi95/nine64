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
      <div className="flex h-full min-h-24 items-center justify-center px-4 py-6 text-center text-sm text-muted-foreground">
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
    <div className="max-h-full overflow-y-auto text-sm">
      <table className="w-full">
        <tbody>
          {pairs.map((p) => (
            <tr key={p.no} className="border-b border-border/40 last:border-0">
              <td className="w-9 py-1 pl-3 text-xs text-muted-foreground tabular">{p.no}.</td>
              <td className="py-0.5">
                <MoveCell record={p.white ?? null} index={p.wi} active={activeIndex === p.wi} onSelect={onSelect} />
              </td>
              <td className="py-0.5">
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
  if (!record) return <span className="px-2 text-muted-foreground">—</span>;
  return (
    <button
      type="button"
      onClick={() => onSelect?.(index)}
      className={cn(
        "w-full rounded px-2 py-1 text-left font-medium transition-colors hover:bg-secondary",
        active && "bg-primary/20 text-foreground",
      )}
    >
      {record.san}
    </button>
  );
}
