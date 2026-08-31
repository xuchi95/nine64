import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { useT } from "@/lib/i18n";
import { getPlayerProfile, type PlayerProfile } from "@/lib/watch/watch.functions";

export const Route = createFileRoute("/players/$slug")({
  loader: ({ params }) => getPlayerProfile({ data: { slug: params.slug } }),
  head: ({ loaderData }) => {
    if (!loaderData) {
      return pageHead({
        path: "/watch",
        title: `Không tìm thấy kỳ thủ — ${APP.name}`,
        description: "Hồ sơ kỳ thủ này không tồn tại.",
        noindex: true,
      });
    }
    const p = loaderData;
    const label = `${p.title ? `${p.title} ` : ""}${p.name}`;
    return pageHead({
      path: `/players/${p.slug}`,
      title: `${label} — ván đấu và giải đấu | ${APP.name}`.slice(0, 110),
      description: `Hồ sơ ${label}${p.rating ? `, hệ số ${p.rating}` : ""}: các giải đã tham dự và ván đấu được tường thuật trên ${APP.name}.`.slice(
        0,
        158,
      ),
      type: "profile",
    });
  },
  pendingComponent: ListSkeleton,
  errorComponent: () => <MissingPlayer />,
  notFoundComponent: () => <MissingPlayer />,
  component: PlayerPage,
});

function MissingPlayer() {
  const { t } = useT();
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl py-16 text-center">
        <p className="text-muted-foreground">{t("wc.player.notFound")}</p>
        <Link to="/events" className="mt-3 inline-block font-semibold text-brass underline">
          {t("wc.events.title")}
        </Link>
      </div>
    </AppShell>
  );
}

function PlayerPage() {
  const { t } = useT();
  const player = Route.useLoaderData() as PlayerProfile | null;
  if (!player) return <MissingPlayer />;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {player.title && <Badge variant="outline" className="font-mono">{player.title}</Badge>}
            <h1 className="text-3xl font-bold">{player.name}</h1>
            {player.rating !== null && (
              <span className="font-mono text-lg text-muted-foreground">{player.rating}</span>
            )}
          </div>
          {player.federation && <p className="text-sm text-muted-foreground">{player.federation}</p>}
          {player.bio && <p className="text-muted-foreground">{player.bio}</p>}
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{t("wc.player.events")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {player.events.length === 0 && <p className="text-muted-foreground">—</p>}
              {player.events.map((e) => (
                <Link
                  key={e.slug}
                  to="/events/$slug"
                  params={{ slug: e.slug }}
                  className="flex items-center gap-2 rounded px-1 py-1 hover:bg-accent/40"
                >
                  <span className="truncate">{e.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(e.startsAt))}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{t("wc.player.games")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {player.games.length === 0 && <p className="text-muted-foreground">—</p>}
              {player.games.map((g) => (
                <Link
                  key={g.id}
                  to="/watch/$gameId"
                  params={{ gameId: g.id }}
                  className="flex items-center gap-2 rounded px-1 py-1 hover:bg-accent/40"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {g.whiteName} — {g.blackName}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{g.result}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
