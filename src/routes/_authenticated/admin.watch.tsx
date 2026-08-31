import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Newspaper, Plus, RadioTower, RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import {
  adminDeleteBroadcastSource,
  adminIngestPgn,
  adminPollBroadcasts,
  adminRunNewsIngest,
  adminSaveBroadcastSource,
  adminSaveEvent,
  adminSaveNewsSource,
  adminSetNewsStatus,
  adminWatchOverview,
} from "@/lib/watch/adminWatch.functions";

export const Route = createFileRoute("/_authenticated/admin/watch")({
  head: () => ({
    meta: [
      { title: `Trung tâm theo dõi · ${APP.name}` },
      {
        name: "description",
        content: "Quản trị Watch Center: giải đấu, nguồn tường thuật PGN, tin tức và nhật ký nạp dữ liệu.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Trung tâm theo dõi · ${APP.name}` },
      { property: "og:description", content: "Công cụ nội bộ vận hành tường thuật và tin tức." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminWatchPage,
});

type Overview = Awaited<ReturnType<typeof adminWatchOverview>>;

const BLANK_EVENT = {
  slug: "",
  name: "",
  location: "",
  timeZone: "UTC",
  startsAt: "",
  roundsTotal: 0,
  isPublished: true,
};

const BLANK_SOURCE = { eventId: "", name: "", kind: "pgn_push" as const, url: "", pollIntervalSeconds: 30 };
const BLANK_NEWS_SOURCE = { slug: "", name: "", feedUrl: "", allowedHosts: "", language: "en" };

function AdminWatchPage() {
  const { t } = useT();
  const overviewFn = useServerFn(adminWatchOverview);
  const saveEventFn = useServerFn(adminSaveEvent);
  const saveSourceFn = useServerFn(adminSaveBroadcastSource);
  const deleteSourceFn = useServerFn(adminDeleteBroadcastSource);
  const ingestPgnFn = useServerFn(adminIngestPgn);
  const pollFn = useServerFn(adminPollBroadcasts);
  const saveNewsSourceFn = useServerFn(adminSaveNewsSource);
  const runNewsFn = useServerFn(adminRunNewsIngest);
  const setNewsStatusFn = useServerFn(adminSetNewsStatus);

  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [eventForm, setEventForm] = useState({ ...BLANK_EVENT });
  const [sourceForm, setSourceForm] = useState({ ...BLANK_SOURCE });
  const [newsSourceForm, setNewsSourceForm] = useState({ ...BLANK_NEWS_SOURCE });
  const [pgn, setPgn] = useState({ eventId: "", text: "" });

  const load = useCallback(async () => {
    try {
      setData((await overviewFn({})) as Overview);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("wc.admin.failed"));
    }
  }, [overviewFn, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Run an admin action, surface its outcome inline, then refresh. */
  const run = useCallback(
    async (fn: () => Promise<unknown>, okText?: string) => {
      setBusy(true);
      setMessage(null);
      try {
        const result = await fn();
        const maybeToken = (result as { token?: string | null } | undefined)?.token;
        if (maybeToken) setToken(maybeToken);
        setMessage(okText ?? t("wc.admin.ok"));
        await load();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : t("wc.admin.failed"));
      } finally {
        setBusy(false);
      }
    },
    [load, t],
  );

  return (
    <AdminShell module="watch" title={t("wc.admin.title")} subtitle={t("wc.admin.subtitle")}>
      <div className="space-y-6">
        {message && (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{message}</div>
        )}
        {token && (
          <div className="rounded-lg border border-brass/60 bg-brass/10 px-3 py-2 text-sm">
            <p className="font-semibold">{t("wc.admin.tokenOnce")}</p>
            <code className="break-all font-mono text-xs">{token}</code>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => pollFn({}))}>
            <RadioTower className="mr-1 size-4" /> {t("wc.admin.pollNow")}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => runNewsFn({ data: {} }))}>
            <Newspaper className="mr-1 size-4" /> {t("wc.admin.fetchNews")}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void load()}>
            <RefreshCw className="mr-1 size-4" /> {t("wc.admin.ok")}
          </Button>
        </div>

        {/* ------------------------------ EVENTS ------------------------------ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t("wc.admin.events")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Slug" value={eventForm.slug} onChange={(v) => setEventForm({ ...eventForm, slug: v })} />
              <Field label="Name" value={eventForm.name} onChange={(v) => setEventForm({ ...eventForm, name: v })} />
              <Field
                label="Starts at (ISO)"
                value={eventForm.startsAt}
                onChange={(v) => setEventForm({ ...eventForm, startsAt: v })}
              />
              <Field
                label="Time zone"
                value={eventForm.timeZone}
                onChange={(v) => setEventForm({ ...eventForm, timeZone: v })}
              />
              <Field
                label="Location"
                value={eventForm.location}
                onChange={(v) => setEventForm({ ...eventForm, location: v })}
              />
              <Field
                label="Rounds"
                value={String(eventForm.roundsTotal)}
                onChange={(v) => setEventForm({ ...eventForm, roundsTotal: Number(v) || 0 })}
              />
            </div>
            <Button
              size="sm"
              disabled={busy || !eventForm.slug || !eventForm.name || !eventForm.startsAt}
              onClick={() =>
                void run(async () => {
                  await saveEventFn({
                    data: {
                      slug: eventForm.slug,
                      name: eventForm.name,
                      location: eventForm.location || null,
                      timeZone: eventForm.timeZone || "UTC",
                      startsAt: eventForm.startsAt,
                      roundsTotal: eventForm.roundsTotal,
                      isPublished: eventForm.isPublished,
                    },
                  });
                  setEventForm({ ...BLANK_EVENT });
                })
              }
            >
              <Plus className="mr-1 size-4" /> {t("wc.admin.newEvent")}
            </Button>

            <div className="space-y-1 text-sm">
              {(data?.events ?? []).map((e) => (
                <div key={e.id} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1">
                  <Badge variant={e.status === "live" ? "default" : "secondary"}>{e.status}</Badge>
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  <code className="hidden font-mono text-xs text-muted-foreground sm:inline">{e.slug}</code>
                  {!e.isPublished && <Badge variant="outline">draft</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* -------------------------- BROADCAST SOURCES -------------------------- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t("wc.admin.sources")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field
                label="Event ID"
                value={sourceForm.eventId}
                onChange={(v) => setSourceForm({ ...sourceForm, eventId: v })}
              />
              <Field label="Name" value={sourceForm.name} onChange={(v) => setSourceForm({ ...sourceForm, name: v })} />
              <Field
                label="PGN URL (optional)"
                value={sourceForm.url}
                onChange={(v) => setSourceForm({ ...sourceForm, url: v })}
              />
              <Field
                label="Poll (s)"
                value={String(sourceForm.pollIntervalSeconds)}
                onChange={(v) => setSourceForm({ ...sourceForm, pollIntervalSeconds: Number(v) || 30 })}
              />
            </div>
            <Button
              size="sm"
              disabled={busy || !sourceForm.eventId || !sourceForm.name}
              onClick={() =>
                void run(async () => {
                  const res = await saveSourceFn({
                    data: {
                      eventId: sourceForm.eventId,
                      name: sourceForm.name,
                      kind: sourceForm.url ? "pgn_url" : "pgn_push",
                      url: sourceForm.url || null,
                      pollIntervalSeconds: sourceForm.pollIntervalSeconds,
                    },
                  });
                  setSourceForm({ ...BLANK_SOURCE });
                  return res;
                })
              }
            >
              <Plus className="mr-1 size-4" /> {t("wc.admin.save")}
            </Button>

            <div className="space-y-1 text-sm">
              {(data?.sources ?? []).map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 rounded border border-border/60 px-2 py-1">
                  <Badge variant={s.status === "error" ? "destructive" : "secondary"}>{s.status}</Badge>
                  <span className="min-w-0 flex-1 truncate">
                    {s.name} <span className="text-muted-foreground">· {s.eventName ?? "—"}</span>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{s.kind}</span>
                  {s.consecutiveFailures > 0 && (
                    <span className="text-xs text-destructive">×{s.consecutiveFailures}</span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        saveSourceFn({
                          data: {
                            id: s.id,
                            eventId: sourceForm.eventId || "",
                            name: s.name,
                            kind: s.kind as "pgn_push" | "pgn_url" | "manual",
                            url: s.url,
                            pollIntervalSeconds: s.pollIntervalSeconds,
                            rotateToken: true,
                          },
                        }),
                      )
                    }
                  >
                    {t("wc.admin.rotateToken")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void run(() => deleteSourceFn({ data: { id: s.id } }))}
                  >
                    {t("wc.admin.delete")}
                  </Button>
                  {s.lastError && <p className="w-full text-xs text-destructive">{s.lastError}</p>}
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-border/60 pt-3">
              <Label>{t("wc.admin.pastePgn")}</Label>
              <Input
                placeholder="Event ID"
                value={pgn.eventId}
                onChange={(e) => setPgn({ ...pgn, eventId: e.target.value })}
              />
              <Textarea
                rows={6}
                value={pgn.text}
                onChange={(e) => setPgn({ ...pgn, text: e.target.value })}
                placeholder="[Event ...]"
                className="font-mono text-xs"
              />
              <Button
                size="sm"
                disabled={busy || !pgn.eventId || pgn.text.length < 10}
                onClick={() =>
                  void run(async () => {
                    const res = await ingestPgnFn({ data: { eventId: pgn.eventId, pgn: pgn.text } });
                    setPgn({ eventId: pgn.eventId, text: "" });
                    return res;
                  })
                }
              >
                {t("wc.admin.ingest")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------- NEWS ------------------------------- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t("wc.admin.news")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field
                label="Slug"
                value={newsSourceForm.slug}
                onChange={(v) => setNewsSourceForm({ ...newsSourceForm, slug: v })}
              />
              <Field
                label="Name"
                value={newsSourceForm.name}
                onChange={(v) => setNewsSourceForm({ ...newsSourceForm, name: v })}
              />
              <Field
                label="Feed URL"
                value={newsSourceForm.feedUrl}
                onChange={(v) => setNewsSourceForm({ ...newsSourceForm, feedUrl: v })}
              />
              <Field
                label="Allowed hosts (comma)"
                value={newsSourceForm.allowedHosts}
                onChange={(v) => setNewsSourceForm({ ...newsSourceForm, allowedHosts: v })}
              />
            </div>
            <Button
              size="sm"
              disabled={busy || !newsSourceForm.slug || !newsSourceForm.name}
              onClick={() =>
                void run(async () => {
                  await saveNewsSourceFn({
                    data: {
                      slug: newsSourceForm.slug,
                      name: newsSourceForm.name,
                      kind: newsSourceForm.feedUrl ? "rss" : "manual",
                      feedUrl: newsSourceForm.feedUrl || null,
                      allowedHosts: newsSourceForm.allowedHosts
                        .split(",")
                        .map((h) => h.trim())
                        .filter(Boolean),
                      language: newsSourceForm.language,
                    },
                  });
                  setNewsSourceForm({ ...BLANK_NEWS_SOURCE });
                })
              }
            >
              <Plus className="mr-1 size-4" /> {t("wc.admin.save")}
            </Button>

            <div className="space-y-1 text-sm">
              {(data?.newsSources ?? []).map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1">
                  <Badge variant={s.enabled ? "secondary" : "outline"}>{s.enabled ? "on" : "off"}</Badge>
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void run(() => runNewsFn({ data: { sourceId: s.id } }))}
                  >
                    {t("wc.admin.fetchNews")}
                  </Button>
                  {s.lastError && <span className="w-full text-xs text-destructive">{s.lastError}</span>}
                </div>
              ))}
            </div>

            <div className="space-y-1 border-t border-border/60 pt-3 text-sm">
              {(data?.news ?? []).map((n) => (
                <div key={n.id} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1">
                  <Badge variant={n.status === "published" ? "default" : "secondary"}>{n.status}</Badge>
                  <span className="min-w-0 flex-1 truncate">{n.title}</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{n.sourceName}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || n.status === "published"}
                    onClick={() => void run(() => setNewsStatusFn({ data: { id: n.id, status: "published" } }))}
                  >
                    {t("wc.admin.publish")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || n.status === "rejected"}
                    onClick={() => void run(() => setNewsStatusFn({ data: { id: n.id, status: "rejected" } }))}
                  >
                    {t("wc.admin.reject")}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------- JOBS ------------------------------- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t("wc.admin.jobs")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {(data?.jobs ?? []).length === 0 && <p className="text-muted-foreground">—</p>}
            {(data?.jobs ?? []).map((j) => (
              <div key={j.id} className="flex flex-wrap items-center gap-2 rounded border border-border/60 px-2 py-1">
                <Badge variant={j.status === "error" ? "destructive" : "secondary"}>{j.status}</Badge>
                <span className="font-mono text-xs">{j.kind}</span>
                <span className="min-w-0 flex-1 truncate">{j.sourceName ?? "—"}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {j.itemsProcessed} · {j.durationMs ?? 0}ms
                </span>
                <time className="text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(
                    new Date(j.createdAt),
                  )}
                </time>
                {j.error && <p className="w-full text-xs text-destructive">{j.error}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
