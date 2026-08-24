import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { GenericSkeleton } from "./components/layout/PageSkeleton";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Prefetch route code + loader data as soon as a link is hovered/touched.
    defaultPreload: "intent",
    defaultPreloadDelay: 40,
    // Let TanStack Query own data freshness; the router only warms route code.
    defaultPreloadStaleTime: 0,
    // Skeleton instead of a blank frame; delayed so fast navigations never flash.
    defaultPendingComponent: GenericSkeleton,
    defaultPendingMs: 180,
    defaultPendingMinMs: 300,
  });

  return router;
};
