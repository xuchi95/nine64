import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import { listPublicGames, type PublicGameRow } from "@/lib/online.challenges.functions";
import { POOL_LABELS, parseTimeControl, type RatingPool } from "@/lib/online/timeControl";
import { Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/watch/platform/")({
  head: () => ({
    meta: [
      { title: `Xem trực tiếp — ${APP.name}` },
      { name: "description", content: "Theo dõi các ván cờ đang diễn ra trên Nine64." },
    ],
  }),
  pendingComponent: ListSkeleton,
  component: WatchIndexPage,
});

function WatchIndexPage() {
  const { t } = useT();
  const listFn = useServerFn(listPublicGames);
  const [rows, setRows] = useState<PublicGameRow[]>([]);

  const refresh = useCallback(async () => {
    try {
      setRows((await listFn({ data: { limit: 30 } })) as PublicGameRow[]);
    } catch {
      // Non-fatal: the interval retries.
    }
  }, [listFn]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">{t("play.watch.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("play.watch.subtitle")}</p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">{t("play.watch.liveNow")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("play.watch.empty")}</p>
            )}
            {rows.map((g) => (
              <Link
                key={g.id}
                to="/watch/$gameId"
                params={{ gameId: g.id }}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted"
              >
                <div>
                  <p className="text-sm font-medium">
                    {g.white_name} ({g.white_rating ?? "—"}) vs {g.black_name} ({g.black_rating ?? "—"})
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {parseTimeControl(g.time_control).label} ·{" "}
                    {POOL_LABELS[(g.pool as RatingPool) ?? "blitz"]?.vi ?? g.pool} ·{" "}
                    {t("play.watch.plies", { n: g.ply_count })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {g.spectator_delay_seconds > 0 && (
                    <Badge variant="secondary">
                      {t("play.watch.delayed", { n: g.spectator_delay_seconds })}
                    </Badge>
                  )}
                  <Eye className="size-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
