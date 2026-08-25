import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getMatchmakingDiagnostics, type MmDiagnostics } from "@/lib/matchmaking.functions";
import {
  clearMmEvents,
  getMmEvents,
  subscribeMmEvents,
  type MmEvent,
} from "@/lib/matchmaking/diagnostics";

export const Route = createFileRoute("/_authenticated/online/diagnostics")({
  head: () => ({
    meta: [
      { title: `Chẩn đoán ghép trận — ${APP.name}` },
      {
        name: "description",
        content: "Xem trạng thái hàng chờ, lý do bị kẹt và các sự kiện realtime/RPC khi tìm đối thủ.",
      },
      { property: "og:title", content: `Chẩn đoán ghép trận — ${APP.name}` },
      { property: "og:description", content: "Trạng thái hàng chờ và nhật ký realtime/RPC của Nine64." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  pendingComponent: ListSkeleton,
  errorComponent: ({ error }) => (
    <AppShell>
      <p role="alert" className="text-sm text-destructive">
        {error.message}
      </p>
    </AppShell>
  ),
  component: DiagnosticsPage;
});

function DiagnosticsPage() {
  const { t } = useT();
  const fetchDiagnostics = useServerFn(getMatchmakingDiagnostics);
  const [data, setData] = useState<MmDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<MmEvent[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = (await fetchDiagnostics({ data: undefined })) as MmDiagnostics;
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [fetchDiagnostics]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    setEvents(getMmEvents());
    return subscribeMmEvents(setEvents);
  }, []);

  const entry = data?.activeEntry ?? null;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t("play.mmDiag.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("play.mmDiag.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/online">
                <ArrowLeft className="mr-2 size-4" />
                {t("play.mmDiag.backToOnline")}
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={cn("mr-2 size-4", loading && "animate-spin")} />
              {t("play.mmDiag.refresh")}
            </Button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">{t("play.mmDiag.queueState")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {entry ? (
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label={t("play.mmDiag.status")} value={entry.status} />
                <Field label={t("play.mmDiag.pool")} value={`${entry.variant} · ${entry.timeControl}`} />
                <Field label={t("play.mmDiag.myRating")} value={String(entry.rating)} />
                <Field
                  label={t("play.mmDiag.waited")}
                  value={t("play.mmDiag.seconds", { n: entry.waitedSeconds })}
                />
                <Field
                  label={t("play.mmDiag.ratingWindow")}
                  value={data?.ratingWindow != null ? `±${data.ratingWindow}` : "—"}
                />
                <Field label={t("play.mmDiag.queueId")} value={entry.id} mono />
              </dl>
            ) : (
              <p className="text-muted-foreground">{t("play.mmDiag.noWaiting")}</p>
            )}

            {data && data.stuckReasons.length > 0 && (
              <ul className="space-y-1 rounded-md border border-brass/30 bg-brass/5 p-3">
                {data.stuckReasons.map((reason) => (
                  <li key={reason} className="text-sm">
                    <span className="font-semibold">{stuckLabel(reason, t)}</span>
                  </li>
                ))}
              </ul>
            )}

            {data?.activeGameId && (
              <p className="text-sm">
                <Link
                  to="/game/$gameId"
                  params={{ gameId: data.activeGameId }}
                  className="font-semibold text-brass underline"
                >
                  {t("play.mmDiag.openActiveGame")}
                </Link>
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-lg">{t("play.mmDiag.poolTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {entry && data && data.pool.length > 0 ? (
              <ul className="divide-y divide-border">
                {data.pool.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span className="font-mono">
                      {p.isMe ? t("play.mmDiag.me") : t("play.mmDiag.otherPlayer")} · {p.rating}
                    </span>
                    <span className="text-muted-foreground">
                      {p.ratingGap == null
                        ? t("play.mmDiag.seconds", { n: p.waitedSeconds })
                        : `Δ${p.ratingGap} · ${t("play.mmDiag.seconds", { n: p.waitedSeconds })} · ${
                            p.withinWindow ? t("play.mmDiag.inWindow") : t("play.mmDiag.outOfWindow")
                          }`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">{t("play.mmDiag.poolEmpty")}</p>
            )}

            {data && data.pools.length > 0 && (
              <div className="mt-4 space-y-1">
                <p className="font-semibold">{t("play.mmDiag.allPools")}</p>
                {data.pools.map((p) => (
                  <p key={`${p.variant}-${p.timeControl}`} className="text-muted-foreground">
                    {p.variant} · {p.timeControl} — {t("play.mmDiag.waitingCount", { n: p.waiting })}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="text-lg">{t("play.mmDiag.eventLog")}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => clearMmEvents()}>
              <Trash2 className="mr-2 size-4" />
              {t("play.mmDiag.clearLog")}
            </Button>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("play.mmDiag.logEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {events.map((e) => (
                  <li key={e.id} className="rounded-md border border-border/60 p-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 font-mono font-semibold uppercase",
                          e.level === "error"
                            ? "bg-destructive/15 text-destructive"
                            : e.level === "warn"
                              ? "bg-brass/15 text-brass"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {e.source}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {new Date(e.at).toLocaleTimeString()}
                      </span>
                      <span className="font-semibold">{e.message}</span>
                    </div>
                    {e.detail && (
                      <pre className="mt-1 overflow-x-auto font-mono text-[11px] text-muted-foreground">
                        {JSON.stringify(e.detail)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 font-semibold", mono && "break-all font-mono text-xs")}>{value}</dd>
    </div>
  );
}

function stuckLabel(reason: string, t: (key: string, vars?: Record<string, string | number>) => string) {
  const map: Record<string, string> = {
    no_waiting_entry: "play.mmDiag.reason.noWaitingEntry",
    empty_pool: "play.mmDiag.reason.emptyPool",
    rating_window_too_narrow: "play.mmDiag.reason.windowNarrow",
    duplicate_waiting_entries: "play.mmDiag.reason.duplicateEntries",
    matched_but_still_waiting: "play.mmDiag.reason.matchedStillWaiting",
    active_game_already_exists: "play.mmDiag.reason.activeGameExists",
  };
  const key = map[reason];
  return key ? t(key) : reason;
}
