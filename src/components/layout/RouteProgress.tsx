import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

/** Thin top progress bar that reflects router navigation/loading state. */
export function RouteProgress() {
  const isLoading = useRouterState({ select: (s) => s.status === "pending" || s.isLoading });
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];

    if (isLoading) {
      setVisible(true);
      setProgress(12);
      timers.current.push(setTimeout(() => setProgress(48), 90));
      timers.current.push(setTimeout(() => setProgress(72), 320));
      timers.current.push(setTimeout(() => setProgress(88), 800));
    } else if (visible) {
      setProgress(100);
      timers.current.push(
        setTimeout(() => {
          setVisible(false);
          setProgress(0);
        }, 260),
      );
    }

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease" }}
    >
      <div
        className="h-full bg-primary shadow-[0_0_12px_var(--primary)]"
        style={{
          width: `${progress}%`,
          transition: "width 220ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </div>
  );
}
