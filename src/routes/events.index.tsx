import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { useT } from "@/lib/i18n";
import { listEvents } from "@/lib/watch/watch.functions";
import type { EventSummary } from "@/lib/watch/types";

type Scope = "all" | "live" | "upcoming" | "past";

export const Route = createFileRoute("/events/")({
  head: () =>
    pageHead({
      path: "/events",
      title: `Lịch giải đấu cờ vua — ${APP.name}`,
      description:
        "Lịch các giải cờ vua lớn: thời gian bắt đầu quy đổi theo múi giờ của bạn, số vòng đấu và liên kết xem tường thuật trực tiếp.",
    }),
  loader: () => listEvents({ data: { scope: "all", limit: 100 } }),
  pendingComponent: ListSkeleton,
  component: EventsPage,
});

/** Render an instant in both the event's zone and the viewer's local zone. */
function useZonedTime() {
  return useMemo(() => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return (iso: string, zone: string) => {
      const date = new Date(iso);
      const fmt = (tz: string) =>
        new Intl.DateTimeFormat("vi-VN", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: tz,
        }).format(date);
      return { event: fmt(zone), local: fmt(local), localZone: local, eventZone: zone };
    };
  }, []);
}

function EventsPage() {
  const { t } = useT();
  const events = Route.useLoaderData() as EventSummary[];
  const [scope, setScope] = useState<Scope>("all");
  const zoned = useZonedTime();

  const filtered = events.filter((e) => {
    if (scope === "all") return true;
    if (scope === "past") return e.status === "finished" || e.status === "cancelled";
    return e.status === scope;
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold">{t("wc.events.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("wc.events.subtitle")}</p>
        </header>

        <div className="flex flex-wrap gap-2">
          {(["all", "live", "upcoming", "past"] as Scope[]).map((s) => (
            <Button key={s} size="sm" variant={scope === s ? "default" : "outline"} onClick={() => setScope(s)}>
              {t(`wc.events.${s}`)}
            </Button>
          ))}
        </div>

        {filtered.length === 0 && <p className="text-sm text-muted-foreground">{t("wc.events.empty")}</p>}

        <div className="space-y-3">
          {filtered.map((e) => {
            const time = zoned(e.startsAt, e.timeZone);
            return (
              <Card key={e.id}>
                <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={e.status === "live" ? "default" : "secondary"}>
                        {t(`wc.events.${e.status === "live" ? "live" : e.status === "upcoming" ? "upcoming" : "past"}`)}
                      </Badge>
                      <Link
                        to="/events/$slug"
                        params={{ slug: e.slug }}
                        className="truncate text-lg font-semibold hover:underline"
                      >
                        {e.name}
                      </Link>
                    </div>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3.5" />
                        {t("wc.events.localTime")}: {time.local}
                      </span>
                      <span>
                        {t("wc.events.eventTime")} ({time.eventZone}): {time.event}
                      </span>
                      {e.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" />
                          {e.location}
                        </span>
                      )}
                      {e.roundsTotal > 0 && <span>{t("wc.events.rounds", { n: e.roundsTotal })}</span>}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/events/$slug" params={{ slug: e.slug }}>
                      {t("wc.events.watch")}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
