import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { APP } from "@/config/app";
import { pageHead, SITE_URL } from "@/lib/seo";
import { useT } from "@/lib/i18n";
import { getEvent, type EventDetail } from "@/lib/watch/watch.functions";

export const Route = createFileRoute("/events/$slug")({
  loader: ({ params }) => getEvent({ data: { slug: params.slug } }),
  head: ({ loaderData }) => {
    if (!loaderData) {
      return pageHead({
        path: "/events",
        title: `Không tìm thấy giải đấu — ${APP.name}`,
        description: "Giải đấu này không tồn tại hoặc chưa được xuất bản.",
        noindex: true,
      });
    }
    const { event } = loaderData;
    const head = pageHead({
      path: `/events/${event.slug}`,
      title: `${event.name} — ${APP.name}`.slice(0, 110),
      description: (
        event.description ??
        `Tường thuật trực tiếp ${event.name}${event.location ? ` tại ${event.location}` : ""}: bảng ván đấu, kỳ thủ và lịch từng vòng.`
      ).slice(0, 158),
      type: "article",
      ...(event.imageUrl?.startsWith("https://") ? { image: event.imageUrl } : {}),
    });
    return {
      ...head,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SportsEvent",
            name: event.name,
            startDate: event.startsAt,
            endDate: event.endsAt ?? undefined,
            eventStatus:
              event.status === "cancelled"
                ? "https://schema.org/EventCancelled"
                : "https://schema.org/EventScheduled",
            url: `${SITE_URL}/events/${event.slug}`,
            location: event.location
              ? { "@type": "Place", name: event.location, address: event.location }
              : { "@type": "VirtualLocation", url: `${SITE_URL}/events/${event.slug}` },
          }),
        },
      ],
    };
  },
  pendingComponent: ListSkeleton,
  errorComponent: () => <MissingEvent />,
  notFoundComponent: () => <MissingEvent />,
  component: EventPage,
});

function MissingEvent() {
  const { t } = useT();
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl py-16 text-center">
        <p className="text-muted-foreground">{t("wc.events.notFound")}</p>
        <Link to="/events" className="mt-3 inline-block font-semibold text-brass underline">
          {t("wc.events.title")}
        </Link>
      </div>
    </AppShell>
  );
}

function EventPage() {
  const { t } = useT();
  const data = Route.useLoaderData() as EventDetail | null;
  if (!data) return <MissingEvent />;
  const { event, rounds, players, games } = data;

  const startLocal = new Intl.DateTimeFormat("vi-VN", { dateStyle: "full", timeStyle: "short" }).format(
    new Date(event.startsAt),
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={event.status === "live" ? "default" : "secondary"}>{event.status}</Badge>
            {event.tour && <Badge variant="outline">{event.tour}</Badge>}
          </div>
          <h1 className="text-3xl font-bold">{event.name}</h1>
          {event.description && <p className="text-muted-foreground">{event.description}</p>}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-4" />
              {startLocal}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" />
                {event.location}
              </span>
            )}
            {event.officialUrl && (
              <a
                href={event.officialUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 text-brass underline"
              >
                <ExternalLink className="size-4" />
                {t("wc.events.official")}
              </a>
            )}
          </p>
        </header>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t("wc.events.games")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {games.length === 0 && <p className="text-sm text-muted-foreground">{t("wc.hub.empty")}</p>}
            {games.map((g) => (
              <Link
                key={g.id}
                to="/watch/$gameId"
                params={{ gameId: g.id }}
                className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2 transition-colors hover:border-brass/60"
              >
                <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">#{g.board}</span>
                <span className="min-w-0 flex-1 truncate">
                  {g.whiteName} — {g.blackName}
                </span>
                {g.roundNumber && (
                  <span className="hidden text-xs text-muted-foreground sm:inline">R{g.roundNumber}</span>
                )}
                <Badge variant={g.status === "live" ? "default" : "secondary"} className="font-mono">
                  {g.status === "live" ? "LIVE" : g.result}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{t("wc.events.players")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {players.length === 0 && <p className="text-muted-foreground">—</p>}
              {players.map((p) => (
                <Link
                  key={p.id}
                  to="/players/$slug"
                  params={{ slug: p.slug }}
                  className="flex items-center gap-2 rounded px-1 py-1 hover:bg-accent/40"
                >
                  {p.title && <span className="font-mono text-xs text-brass">{p.title}</span>}
                  <span className="truncate">{p.name}</span>
                  {p.rating !== null && (
                    <span className="ml-auto font-mono text-xs text-muted-foreground">{p.rating}</span>
                  )}
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{t("wc.events.rounds", { n: event.roundsTotal })}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {rounds.length === 0 && <p className="text-muted-foreground">—</p>}
              {rounds.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="font-semibold">{t("wc.board.round", { n: r.number })}</span>
                  <span className="text-muted-foreground">{r.name ?? ""}</span>
                  {r.startsAt && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(
                        new Date(r.startsAt),
                      )}
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
