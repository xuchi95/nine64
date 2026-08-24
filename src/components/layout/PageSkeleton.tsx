import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Route-level skeletons. They render inside AppShell so the header/nav stay
 * mounted while a route resolves — no layout shift, no white flash.
 */

function Line({ className }: { className?: string }) {
  return <Skeleton className={cn("h-4 w-full rounded-md", className)} />;
}

function CardBlock({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card/60 p-5", className)}>
      <Line className="h-3 w-24" />
      <Line className="mt-4 h-7 w-32" />
      <Line className="mt-3 h-3 w-full" />
      <Line className="mt-2 h-3 w-3/4" />
    </div>
  );
}

function Header() {
  return (
    <div className="space-y-3">
      <Line className="h-3 w-40" />
      <Line className="h-8 w-64" />
      <Line className="h-3 w-80 max-w-full" />
    </div>
  );
}

/** Generic page: title block + a few cards. */
export function GenericSkeleton() {
  return (
    <SkeletonFrame>
      <Header />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardBlock key={i} />
        ))}
      </div>
    </SkeletonFrame>
  );
}

/** List/table page: rows of equal height. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <SkeletonFrame>
      <Header />
      <div className="rounded-xl border border-border/60 bg-card/60">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border/40 px-5 py-4 last:border-0"
          >
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Line className="h-3.5 w-1/2" />
              <Line className="h-3 w-1/3" />
            </div>
            <Skeleton className="hidden h-8 w-20 rounded-md sm:block" />
          </div>
        ))}
      </div>
    </SkeletonFrame>
  );
}

/** Board page: square board + side panel. */
export function BoardSkeleton() {
  return (
    <SkeletonFrame wide>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Line className="h-4 w-48" />
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <Line className="h-4 w-40" />
        </div>
        <div className="space-y-4">
          <CardBlock />
          <CardBlock />
          <div className="space-y-2 rounded-xl border border-border/60 bg-card/60 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Line key={i} className="h-3" />
            ))}
          </div>
        </div>
      </div>
    </SkeletonFrame>
  );
}

/** Dashboard page: stat tiles + a wide chart. */
export function DashboardSkeleton() {
  return (
    <SkeletonFrame wide>
      <Header />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardBlock key={i} />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <CardBlock />
        <CardBlock />
      </div>
    </SkeletonFrame>
  );
}

/** Auth / narrow form page. */
export function FormSkeleton() {
  return (
    <SkeletonFrame>
      <div className="mx-auto w-full max-w-md space-y-5">
        <Line className="h-8 w-48" />
        <Line className="h-3 w-64" />
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton className="h-11 w-full rounded-md" />
        <Line className="h-3 w-40" />
      </div>
    </SkeletonFrame>
  );
}

function SkeletonFrame({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <AppShell wide={wide}>
      <div aria-busy="true" aria-live="polite" className="nexus-skeleton-fade space-y-6">
        <span className="sr-only">Đang tải nội dung…</span>
        {children}
      </div>
    </AppShell>
  );
}
