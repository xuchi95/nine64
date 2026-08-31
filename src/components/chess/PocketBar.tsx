import { Piece, type PieceColor, type PieceType } from "./Piece";
import { useBoardStyle } from "./useBoardStyle";
import { cn } from "@/lib/utils";

export interface PocketBarProps {
  color: PieceColor;
  /** Piece letter -> count held in the pocket. */
  pocket: Record<string, number>;
  /** Pocket piece currently armed for a drop (only for the side to move). */
  armed: PieceType | null;
  /** null when this side may not drop right now (not their turn / game over). */
  onArm: ((type: PieceType | null) => void) | null;
  className?: string;
}

/** Drop order mirrors piece value, so the bar reads the same every game. */
const ORDER: PieceType[] = ["p", "n", "b", "r", "q"];

/**
 * Crazyhouse piece pocket. Clicking a piece arms it; the board then highlights
 * every legal drop square. Rules live in the engine — this is display only.
 */
export function PocketBar({ color, pocket, armed, onArm, className }: PocketBarProps) {
  const { pieceSet } = useBoardStyle();
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 py-1.5",
        className,
      )}
      data-testid={`pocket-${color}`}
    >
      {ORDER.map((type) => {
        const count = pocket[type] ?? 0;
        const disabled = !onArm || count === 0;
        const isArmed = armed === type && !disabled;
        return (
          <button
            key={type}
            type="button"
            disabled={disabled}
            aria-pressed={isArmed}
            aria-label={`${type} x${count}`}
            onClick={() => onArm?.(isArmed ? null : type)}
            className={cn(
              "relative flex size-9 items-center justify-center rounded-md border transition-colors",
              disabled
                ? "cursor-default border-transparent opacity-30"
                : "border-border hover:border-primary/50",
              isArmed && "border-primary bg-primary/15",
            )}
          >
            <Piece type={type} color={color} set={pieceSet} size={28} />
            {count > 1 && (
              <span className="absolute -bottom-1 -right-1 rounded bg-surface-3 px-1 font-mono text-[10px] leading-tight">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
