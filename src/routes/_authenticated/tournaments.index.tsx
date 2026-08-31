import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import { listTournaments, type TournamentListRow } from "@/lib/tournaments/tournaments.functions";
import { Trophy, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tournaments/")({
  head: () => ({
    meta: [
      { title: `Giải đấu cờ vua — ${APP.name}` },
      {
        name: "description",
        content:
          "Đấu trường, hệ Thụy Sĩ, vòng tròn và nhánh loại trực tiếp trên Nine64: ghi danh, bốc thăm tự động và bảng xếp hạng thời gian thực.",
      },
      { property: "og:title", content: `Giải đấu cờ vua — ${APP.name}` },
      {
        property: "og:description",
        content: "Ghi danh giải cờ vua trực tuyến với bốc thăm và xếp hạng tự động.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  pendingComponent: ListSkeleton,
  component: TournamentsIndexPage,
});

const GROUPS = ["live", "upcoming", "past"] as const;

function groupOf(row: TournamentListRow): (typeof GROUPS)[number] {
  if (row.status === "running") return "live";
  if (row.status === "finished" || row.status === "cancelled") return "past";
  return "upcoming";
}

export function formatTournamentDate(value: string, locale: string): string {
  return new Date(value).toLocaleString(locale === "vi" ? "vi-VN" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TournamentsIndexPage() {
  const { t, locale } = useT();
  const listFn = useServerFn(listTournaments);
  const [rows, setRows] = useState<TournamentListRow[]>([]);

  const refresh = useCallback(async () => {
    try {
      setRows((await listFn({})) as TournamentListRow[]);
    } catch {
      // Non-fatal: the interval retries.
    }
  }, [listFn]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Trophy className="size-6 text-primary" />
          {t("tourney.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("tourney.subtitle")}</p>

        {rows.length === 0 && (
          <p className="mt-8 text-sm text-muted-foreground">{t("tourney.empty")}</p>
        )}

        {GROUPS.map((group) => {
          const items = rows.filter((r) => groupOf(r) === group);
          if (items.length === 0) return null;
          return (
            <Card className="mt-6" key={group}>
              <CardHeader>
                <CardTitle className="text-lg">{t(`tourney.${group}`)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((row) => (
                  <Link
                    key={row.id}
                    to="/tournaments/$slug"
                    params={{ slug: row.slug }}
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted"
                  >
                    <div>
                      <p className="text-sm font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(`tourney.format.${row.format}`)} · {row.timeControl} ·{" "}
                        {row.rated ? t("tourney.rated") : t("tourney.casual")} ·{" "}
                        {formatTournamentDate(row.startsAt, locale)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {row.joined && <Badge variant="secondary">{t("tourney.joined")}</Badge>}
                      <Badge variant={row.status === "running" ? "default" : "outline"}>
                        {t(`tourney.status.${row.status}`)}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="size-3.5" />
                        {row.playerCount}
                      </span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
