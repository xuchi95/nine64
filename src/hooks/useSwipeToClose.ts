import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  /** Which edge the drawer is attached to. */
  side?: "left" | "right";
  /** Fraction of the drawer width that must be dragged to close. */
  threshold?: number;
  onClose: () => void;
  enabled?: boolean;
};

/**
 * Touch drag-to-close for a side drawer. Follows the finger horizontally and
 * closes when the drag passes a distance threshold or is flicked fast enough.
 * Vertical gestures are ignored so inner scrolling keeps working.
 */
export function useSwipeToClose({
  side = "left",
  threshold = 0.35,
  onClose,
  enabled = true,
}: Options) {
  const ref = useRef<HTMLDivElement | null>(null);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const axis = useRef<"none" | "x" | "y">("none");
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dir = side === "left" ? -1 : 1;

  const reset = useCallback(() => {
    start.current = null;
    axis.current = "none";
    setDragging(false);
    setOffset(0);
  }, []);

  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!enabled || e.touches.length !== 1) return;
      const t = e.touches[0]!;
      start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      axis.current = "none";
    },
    [enabled],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const s = start.current;
      if (!s || !enabled) return;
      const t = e.touches[0]!;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;

      if (axis.current === "none") {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis.current = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
        if (axis.current === "x") setDragging(true);
      }
      if (axis.current !== "x") return;

      // Only allow dragging toward the edge the drawer came from.
      const travel = dir === -1 ? Math.min(0, dx) : Math.max(0, dx);
      setOffset(travel);
    },
    [dir, enabled],
  );

  const finish = useCallback(() => {
    const s = start.current;
    if (!s || axis.current !== "x") {
      reset();
      return;
    }
    const width = ref.current?.offsetWidth ?? window.innerWidth * 0.86;
    const distance = Math.abs(offset);
    const velocity = distance / Math.max(1, Date.now() - s.t); // px per ms
    if (distance > width * threshold || velocity > 0.5) {
      setDragging(false);
      setOffset(dir * width);
      onClose();
      window.setTimeout(reset, 240);
      return;
    }
    reset();
  }, [dir, offset, onClose, reset, threshold]);

  return {
    ref,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd: finish,
      onTouchCancel: reset,
    },
    style: {
      transform: offset ? `translate3d(${offset}px, 0, 0)` : undefined,
      transition: dragging ? "none" : undefined,
      touchAction: "pan-y" as const,
    } satisfies React.CSSProperties,
    dragging,
  };
}
