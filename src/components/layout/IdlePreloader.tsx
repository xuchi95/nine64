import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Warms the route chunks users reach most often, but only after the page is
 * interactive and only when the browser is idle — so it never competes with
 * LCP/TTI. Skipped on slow or metered connections.
 */
const WARM_ROUTES = ["/play", "/games", "/puzzles", "/play/ai", "/analysis"] as const;

export function IdlePreloader() {
  const router = useRouter();

  useEffect(() => {
    const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } })
      .connection;
    if (conn?.saveData) return;
    if (conn?.effectiveType && /2g/.test(conn.effectiveType)) return;

    let cancelled = false;
    const idle =
      (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
        .requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));

    const handle = idle(() => {
      if (cancelled) return;
      WARM_ROUTES.forEach((to, i) => {
        window.setTimeout(() => {
          if (!cancelled) void router.preloadRoute({ to }).catch(() => {});
        }, i * 220);
      });
    }, { timeout: 3000 });

    return () => {
      cancelled = true;
      const cancel = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (cancel) cancel(handle as number);
      else window.clearTimeout(handle as number);
    };
  }, [router]);

  return null;
}
