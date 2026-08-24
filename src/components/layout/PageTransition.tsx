import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Fades/slides each route in when its pathname changes, so navigations and
 * full reloads both land smoothly instead of snapping.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div key={pathname} className="nexus-page-enter">
      {children}
    </div>
  );
}

/** Default pending UI: keeps layout stable while a route resolves. */
export function RoutePending() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-secondary">
        <div className="nexus-indeterminate h-full w-1/3 rounded-full bg-primary" />
      </div>
      <p className="text-xs text-muted-foreground">Đang tải…</p>
    </div>
  );
}
