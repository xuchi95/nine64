import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import {
  getTournament,
  joinTournament,
  withdrawTournament,
  type TournamentDetail,
} from "@/lib/tournaments/tournaments.functions";
import { formatTournamentDate } from "./tournaments.index";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tournaments/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Giải đấu ${params.slug} — ${APP.name}` },
      {
        name: "description",
        content: "Bảng xếp hạng, cặp đấu và ghi danh cho giải đấu cờ vua trên Nine64.",
      },
      { property: "og:title", content: `Giải đấu ${params.slug} — ${APP.name}` },
      {
        property: "og:description",
        content: "Theo dõi bảng xếp hạng và cặp đấu theo thời gian thực.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  pendingComponent: ListSkeleton,
  component: TournamentDetailPage,
});

function TournamentDetailPage() {
  const { slug } = useParams({ from: "/_authenticated/tournaments/$slug" });
  const { t, locale } = useT();
  const getFn = useServerFn(getTournament);
  const joinFn = useServerFn(joinTournament);
  const withdrawFn = useServerFn(withdrawTournament);

  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDetail((await getFn({ data: { slug } })) as TournamentDetail | null);
    } catch {
      // Non-fatal: polling retries.
    } finally {
      setLoaded(true);
    }
  }, [getFn, slug]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 6000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const act = async (kind: "join" | "withdraw") => {
    if (!detail) return;
    setBusy(true);
    setMessage(null);
    try {
      const fn = kind === "join" ? joinFn : withdrawFn;
      const res = (await fn({ data: { id: detail.tournament.id } })) as {
        ok: boolean;
        code: string;
      };
      if (!res.ok) setMessage(t(`tourney.err.${res.code}`) || t("tourney.err.generic"));
      await refresh();
    } catch {
      setMessage(t("tourney.err.generic"));
    } finally {
      setBusy(false);
    }
  };

  if (loaded && !detail) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl">
          <p className="text-sm text-muted-foreground">{t("tourney.notFound")}</p>
        </div>
      </AppShell>
    );
  }
  if (!detail) return <ListSkeleton />;

  const tour = detail.tournament;
  const latestRound = detail.pairings.length ? detail.pairings[0]!.roundNumber : 0;
  const currentPairings = detail.pairings.filter((p) => p.roundNumber === latestRound);
  const canJoin = tour.status === "registration" || (tour.status === "running" && tour.lateJoin);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Trophy className="size-6 text-primary" />
              {tour.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(`tourney.format.${tour.format}`)} · {tour.timeControl} ·{" "}
              {tour.rated ? t("tourney.rated") : t("tourney.casual")} ·{" "}
              {formatTournamentDate(tour.startsAt, locale)}
            </p>
            {tour.description && <p className="mt-2 text-sm">{tour.description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={tour.status === "running" ? "default" : "outline"}>
              {t(`tourney.status.${tour.status}`)}
            </Badge>
            {tour.paused && <Badge variant="secondary">{t("tourney.paused")}</Badge>}
            <Badge variant="secondary">{t("tourney.players", { n: tour.playerCount })}</Badge>
            {detail.me.activeGameId && (
              <Button asChild size="sm">
                <Link to="/game/$gameId" params={{ gameId: detail.me.activeGameId }}>
                  {t("tourney.myGame")}
                </Link>
              </Button>
            )}
            {canJoin && !detail.me.joined && (
              <Button size="sm" disabled={busy} onClick={() => void act("join")}>
                {t("tourney.join")}
              </Button>
            )}
            {detail.me.joined && tour.status !== "finished" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("withdraw")}>
                {t("tourney.withdraw")}
              </Button>
            )}
          </div>
        </div>

        {message && (
          <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {message}
          </p>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("tourney.standings")}</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 text-left font-medium">{t("tourney.rank")}</th>
                    <th className="text-left font-medium">{t("tourney.player")}</th>
                    <th className="w-16 text-right font-medium">{t("tourney.score")}</th>
                    <th className="w-20 text-right font-medium">{t("tourney.wdl")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.players.map((p, index) => (
                    <tr key={p.userId} className="border-t border-border/60">
                      <td className="py-1.5 tabular-nums">{p.rank ?? index + 1}</td>
                      <td className="py-1.5">
                        {p.displayName}{" "}
                        <span className="text-xs text-muted-foreground">({p.rating})</span>
                        {p.status === "withdrawn" && (
                          <span className="ml-1 text-xs text-muted-foreground">·</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{p.score}</td>
                      <td className="py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                        {p.wins}/{p.draws}/{p.losses}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {t("tourney.pairings")}
                {latestRound > 0 && ` · ${t("tourney.round", { n: latestRound })}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {currentPairings.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("tourney.noPairings")}</p>
              )}
              {currentPairings.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
                >
                  <span className="text-xs text-muted-foreground">
                    {t("tourney.board")} {p.board}
                  </span>
                  <span className="flex-1 truncate">
                    {p.status === "bye"
                      ? `${p.whiteName} — ${t("tourney.bye")}`
                      : `${p.whiteName} vs ${p.blackName}`}
                  </span>
                  {p.result && <Badge variant="outline">{p.result}</Badge>}
                  {p.gameId && (
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/watch/$gameId" params={{ gameId: p.gameId }}>
                        {t("tourney.watch")}
                      </Link>
                    </Button>
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
