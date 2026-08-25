import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const CLAMP = 800;

/**
 * Compact evaluation graph (white advantage above the midline).
 * `evals` holds white-POV centipawns after each move.
 */
export function EvalGraph({
  startEval,
  evals,
  activeIndex,
  onSelect,
  className,
}: {
  startEval: number;
  evals: (number | null)[];
  activeIndex?: number;
  onSelect?: (index: number) => void;
  className?: string;
}) {
  const { t } = useT();
  const points = useMemo(() => {
    const series = [startEval, ...evals];
    let last = 0;
    return series.map((cp) => {
      const value = cp === null ? last : Math.max(-CLAMP, Math.min(CLAMP, cp));
      last = value;
      return value;
    });
  }, [startEval, evals]);

  const width = 100;
  const height = 40;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const y = (cp: number) => height / 2 - (cp / CLAMP) * (height / 2);
  const path = points.map((cp, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${y(cp).toFixed(2)}`).join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-24 w-full rounded-md bg-surface-2"
        role="img"
        aria-label={t("game.evalGraph.aria")}
      >
        <rect x="0" y="0" width={width} height={height / 2} fill="var(--color-foreground)" opacity="0.06" />
        <path d={area} fill="var(--color-primary)" opacity="0.22" />
        <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--color-border)"
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
        {typeof activeIndex === "number" && activeIndex >= -1 && (
          <line
            x1={(activeIndex + 1) * step}
            y1="0"
            x2={(activeIndex + 1) * step}
            y2={height}
            stroke="var(--color-accent)"
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {onSelect && (
        <div className="absolute inset-0 flex">
          {points.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={t("game.evalGraph.jumpToMove", { n: i })}
              className="h-full flex-1 cursor-pointer"
              onClick={() => onSelect(i - 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
