import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getAdminDashboard, type AdminDashboard, type WidgetState } from "@/lib/adminCenter.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: `Trung tâm quản trị · ${APP.name}` },
      { name: "description", content: "Tổng quan vận hành Nine64: người dùng, ván đấu, Fair Play, bảo mật." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Trung tâm quản trị · ${APP.name}` },
      { property: "og:description", content: "Bảng điều khiển vận hành nội bộ của Nine64." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDashboardPage,
});

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Panel<T>({
  title,
  state,
  href,
  loading,
  render,
}: {
  title: string;
  state: WidgetState<T> | undefined;
  href?: string;
  loading: boolean;
  render: (value: T) => React.ReactNode;
}) {
  const { t } = useT();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        {href && (
          <Link to={href} className="text-xs text-primary hover:underline">
            {t("adminc.dash.details")}
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {loading || !state ? (
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted/50" />
            ))}
          </div>
        ) : state.ok ? (
          render(state.value)
        ) : (
          <p className="text-sm text-destructive">{t("adminc.dash.widgetError")}</p>
        )}
      </CardContent>
    </Card>
  );
}

function AdminDashboardPage() {
  const { t } = useT();
  const dashFn = useServerFn(getAdminDashboard);
  const [windowDays, setWindowDays] = useState<1 | 7 | 30>(1);
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (w: 1 | 7 | 30) => {
      setBusy(true);
      setError(null);
      try {
        setData((await dashFn({ data: { windowDays: w } })) as AdminDashboard);
      } catch (e) {
        setError(e instanceof Error ? e.message : "ERROR");
      } finally {
        setBusy(false);
      }
    },
    [dashFn],
  );

  useEffect(() => {
    void load(windowDays);
  }, [load, windowDays]);

  const newLabel = t(`adminc.dash.window.${windowDays}`);

  return (
    <AdminShell module="dashboard" title={t("adminc.dash.title")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold">{t("adminc.dash.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("adminc.dash.subtitle")}</p>
        </div>
        <div className="flex rounded-md border border-border/60 p-0.5">
          {([1, 7, 30] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWindowDays(w)}
              aria-pressed={windowDays === w}
              className={cn(
                "rounded px-2.5 py-1 text-xs",
                windowDays === w ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground",
              )}
            >
              {t(`adminc.dash.window.${w}`)}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void load(windowDays)}>
          <RefreshCw className={cn("mr-2 size-4", busy && "animate-spin")} />
          {t("adminc.dash.refresh")}
        </Button>
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {data && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("adminc.dash.updated", { time: new Date(data.generatedAt).toLocaleTimeString() })}
        </p>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel
          title={t("adminc.dash.users")}
          state={data?.users}
          loading={busy && !data}
          href="/admin/users"
          render={(v) => (
            <div className="grid grid-cols-2 gap-3">
              <Metric label={t("adminc.dash.usersTotal")} value={v.total} />
              <Metric
                label={t("adminc.dash.usersNew", { label: newLabel })}
                value={windowDays === 1 ? v.new24h : windowDays === 7 ? v.new7d : v.new30d}
              />
            </div>
          )}
        />

        <Panel
          title={t("adminc.dash.games")}
          state={data?.games}
          loading={busy && !data}
          render={(v) => (
            <div className="grid grid-cols-2 gap-3">
              <Metric label={t("adminc.dash.gamesTotal")} value={v.total} />
              <Metric label={t("adminc.dash.games24h")} value={v.last24h} />
              <Metric label={t("adminc.dash.gamesActive")} value={v.active} />
              <Metric label={t("adminc.dash.gamesTimeout")} value={v.timeoutPending} />
            </div>
          )}
        />

        <Panel
          title={t("adminc.dash.queue")}
          state={data?.queue}
          loading={busy && !data}
          render={(v) => <Metric label={t("adminc.dash.queueWaiting")} value={v.waiting} />}
        />

        <Panel
          title={t("adminc.dash.fairplay")}
          state={data?.fairplay}
          loading={busy && !data}
          href="/admin/fairplay"
          render={(v) => (
            <div className="grid grid-cols-2 gap-3">
              <Metric label={t("adminc.dash.fpQueued")} value={v.queued} />
              <Metric label={t("adminc.dash.fpRunning")} value={v.running} />
              <Metric label={t("adminc.dash.fpFailed")} value={v.failed} />
              <Metric
                label={t("adminc.dash.worker")}
                value={v.workerConfigured ? t("adminc.dash.configured") : t("adminc.dash.notConfigured")}
              />
            </div>
          )}
        />

        <Panel
          title={t("adminc.dash.notifications")}
          state={data?.notifications}
          loading={busy && !data}
          render={(v) => (
            <div className="grid grid-cols-2 gap-3">
              <Metric label={t("adminc.dash.notifQueued")} value={v.queued} />
              <Metric label={t("adminc.dash.notifFailed")} value={v.failed} />
            </div>
          )}
        />

        <Panel
          title={t("adminc.dash.security")}
          state={data?.security}
          loading={busy && !data}
          href="/admin/security"
          render={(v) => <Metric label={t("adminc.dash.securityEvents")} value={v.events24h} />}
        />

        <Panel
          title={t("adminc.dash.ai")}
          state={data?.ai}
          loading={busy && !data}
          render={(v) => (
            <div className="grid grid-cols-2 gap-3">
              <Metric label={t("adminc.dash.aiFailures")} value={v.failures} />
              <Metric label={t("adminc.dash.aiRateLimited")} value={v.rateLimited} />
            </div>
          )}
        />

        <Panel
          title={t("adminc.dash.engine")}
          state={data?.engine}
          loading={busy && !data}
          href="/admin/engine"
          render={(v) => (
            <Metric
              label={t("adminc.dash.engine")}
              value={v.status === "configured" ? t("adminc.dash.configured") : t("adminc.dash.notConfigured")}
            />
          )}
        />
      </div>
    </AdminShell>
  );
}
