import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { LABEL_META, type MoveLabel } from "@/lib/analysis/classify";
import { plyLabel } from "@/lib/analysis/variation";
import type { PlyAnalysis } from "@/lib/analysis/types";
import type { SavedGame } from "@/lib/history";

function scoreText(cp: number | null, mateIn: number | null): string {
  if (mateIn !== null) return `M${Math.abs(mateIn)}`;
  if (cp === null) return "—";
  const pawns = cp / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

interface Props {
  game: SavedGame;
  onSelectMove: (index: number) => void;
}

/** Deep-mode panel: detailed engine variations for each mistake. */
export function VariationPanel({ game, onSelectMove }: Props) {
  const items = useMemo<PlyAnalysis[]>(
    () => (game.review?.plies ?? []).filter((p) => (p.variations?.length ?? 0) > 0),
    [game.review],
  );

  if (game.review?.depth !== "deep") return null;

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-accent" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Biến thể gợi ý (phân tích sâu)
        </h2>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Không có sai lầm đáng kể nào trong ván này — engine không tìm thấy phương án nào tốt hơn
          rõ rệt.
        </p>
      ) : (
        <ul className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {items.map((ply) => {
            const meta = LABEL_META[ply.label as MoveLabel];
            return (
              <li key={ply.index} className="rounded-md bg-surface-2 p-3">
                <button
                  type="button"
                  onClick={() => onSelectMove(ply.index)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="tabular text-sm font-semibold">
                    {plyLabel(ply.index)} {ply.san}
                    <span className={`ml-1 ${meta?.tone ?? ""}`}>{meta?.symbol}</span>
                  </span>
                  <span className={`text-xs font-semibold ${meta?.tone ?? ""}`}>
                    {meta?.title} · -{ply.loss}%
                  </span>
                </button>

                {ply.playedPvSan && ply.playedPvSan.length > 1 && (
                  <p className="tabular mt-2 text-xs text-muted-foreground">
                    <span className="font-semibold uppercase tracking-wider">Nước đã đi:</span>{" "}
                    {ply.playedPvSan.join(" ")}
                  </p>
                )}

                <ol className="mt-2 space-y-1">
                  {ply.variations!.map((v, idx) => (
                    <li key={v.uci} className="tabular flex gap-2 text-xs">
                      <span className="w-6 shrink-0 font-semibold text-accent">
                        {idx === 0 ? "★" : `#${idx + 1}`}
                      </span>
                      <span className="flex-1 leading-relaxed">
                        {v.pvSan.join(" ")}
                        {v.pvSan.length >= 8 ? " …" : ""}
                      </span>
                      <span className="shrink-0 font-semibold">
                        {scoreText(v.cp, v.mateIn)}
                        <span className="ml-1 text-muted-foreground">d{v.depth}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
