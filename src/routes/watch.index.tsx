import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Newspaper, Radio, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { useT } from "@/lib/i18n";
import { listLiveBroadcasts } from "@/lib/watch/watch.functions";
import type { BroadcastGameSummary } from "@/lib/watch/types";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/watch/")({
  head: () =>
    pageHead({
      path: "/watch",
      title: `Trung tâm theo dõi — ${APP.name}`,
      description:
        "Theo dõi ván cờ trực tiếp từ các giải đấu lớn: bàn cờ cập nhật realtime, danh sách nước đi, khai cuộc và phân tích engine ngay trên máy bạn.",
    }),
  loader: () => listLiveBroadcasts({ data: { limit: 24 } }),
  pendingComponent: ListSkeleton,
  errorComponent: () => (
    <AppShell>
      <p className="mx-auto max-w-3xl py-10 text-sm text-muted-foreground">—</p>
    </AppShell>
  ),
  component: WatchHub,
});

function WatchHub() {
  const { t } = useT();
  const initial = Route.useLoaderData() as BroadcastGameSummary[];
  const listFn = useServerFn(listLiveBroadcasts);
  const [games, setGames] = useState<BroadcastGameSummary[]>(initial);

  const refresh = useCallback(async () => {
    try {
      setGames((await listFn({ data: { limit: 24 } })) as BroadcastGameSummary[]);
    } catch {
      // Non-fatal: realtime or the next tick retries.
    }
  }, [listFn]);

  // Realtime keeps the hub honest; the interval is the fallback when the socket drops.
  useEffect(() => {
    const channel = supabase
      .channel("watch:hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "event_games" }, () => {
        void refresh();
      })
      .subscribe();
    const id = window.setInterval(() => void refresh(), 20000);
    return () => {
      window.clearInterval(id);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const live = games.filter((g) => g.status === "live");
  const recent = games.filter((g) => g.status !== "live");

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-8">
        <header>
          <h1 className="text-3xl font-bold">{t("wc.hub.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("wc.hub.subtitle")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/events">
                <CalendarDays className="mr-1 size-4" /> {t("wc.hub.eventsCta")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/news">
                <Newspaper className="mr-1 size-4" /> {t("wc.hub.newsCta")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/watch/platform">
                <Users className="mr-1 size-4" /> {t("wc.hub.platformCta")}
              </Link>
            </Button>
          </div>
        </header>

        <Section title={t("wc.hub.live")} games={live} empty={t("wc.hub.empty")} />
        {recent.length > 0 && <Section title={t("wc.hub.recent")} games={recent} empty="" />}
      </div>
    </AppShell>
  );
}

function Section({ title, games, empty }: { title: string; games: BroadcastGameSummary[]; empty: string }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <Radio className="size-4 text-brass" /> {title}
      </h2>
      {games.length === 0 ? (
        empty && <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {games.map((g) => (
            <Link key={g.id} to="/watch/$gameId" params={{ gameId: g.id }} className="block">
              <Card className="transition-colors hover:border-brass/60">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={g.status === "live" ? "default" : "secondary"}>
                      {g.status === "live" ? "LIVE" : g.result}
                    </Badge>
                    <span className="truncate">{g.eventName}</span>
                    {g.roundNumber && <span>· R{g.roundNumber}</span>}
                  </div>
                  <p className="font-semibold">
                    {g.whiteTitle ? `${g.whiteTitle} ` : ""}
                    {g.whiteName} — {g.blackTitle ? `${g.blackTitle} ` : ""}
                    {g.blackName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {g.eco ? `${g.eco} ` : ""}
                    {g.openingName ?? ""}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
