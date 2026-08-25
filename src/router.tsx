import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { GenericSkeleton } from "./components/layout/PageSkeleton";
import { reportAccessDenied } from "./lib/security/rlsAudit";

export const getRouter = () => {
  const queryClient = new QueryClient({
    // Any query/mutation the backend refuses is audited centrally.
    queryCache: new QueryCache({
      onError: (error, query) => {
        reportAccessDenied(error, { resource: String(query.queryKey[0] ?? "query"), operation: "read" });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        reportAccessDenied(error, {
          resource: String(mutation.options.mutationKey?.[0] ?? "mutation"),
          operation: "write",
        });
      },
    }),
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
