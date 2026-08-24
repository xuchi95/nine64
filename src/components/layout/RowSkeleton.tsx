import { Skeleton } from "@/components/ui/skeleton";

/** Inline placeholder rows for lists that fetch data after the page mounts. */
export function RowSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="nexus-skeleton-fade space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/40 px-4 py-3"
        >
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2 rounded-md" />
            <Skeleton className="h-3 w-1/3 rounded-md" />
          </div>
          <Skeleton className="hidden h-7 w-16 rounded-md sm:block" />
        </div>
      ))}
    </div>
  );
}
