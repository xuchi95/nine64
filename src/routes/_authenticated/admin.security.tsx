import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, ShieldAlert, Siren, Lock } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP } from "@/config/app";
import { hasRole } from "@/lib/auth.functions";
import {
  listProbeAlerts,
  listSecurityEvents,
  type ProbeAlertRow,
  type SecurityEventRow,
} from "@/lib/security.functions";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import {
  listNotificationOutbox,
  retryNotificationEvent,
} from "@/lib/notifications.functions";
import type { NotificationOutboxEvent } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/security")({
  head: () => ({
    meta: [
      { title: `Nhật ký truy cập bị từ chối — ${APP.name}` },
      {
        name: "description",
        content: "Theo dõi các truy vấn bị chặn bởi phân quyền và cảnh báo hành vi dò quyền trên Nine64.",
      },
      { property: "og:title", content: `Nhật ký truy cập bị từ chối — ${APP.name}` },
      { property: "og:description", content: "Giám sát dò quyền và truy cập bị chặn trên Nine64." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  pendingComponent: ListSkeleton,
  component: SecurityLogPage,
});

function useWindows() {
  const { t } = useT();
  return [
    { label: t("admin.security.window1h"), value: 60 },
    { label: t("admin.security.window24h"), value: 1440 },
    { label: t("admin.security.window7d"), value: 10080 },
  ];
}

function useKinds() {
  const { t } = useT();
  return [
    { label: t("admin.security.kindAll"), value: "all" as const },
    { label: t("admin.security.kindAccessDenied"), value: "access_denied" as const },
    { label: t("admin.security.kindProbeSuspected"), value: "probe_suspected" as const },
    { label: t("admin.security.kindRpcDenied"), value: "rpc_denied" as const },
  ];
}

function useKindLabel() {
  const { t } = useT();
  return useCallback(
    (kind: string): string => {
      if (kind === "access_denied") return t("admin.security.kindLabelAccessDenied");
      if (kind === "probe_suspected") return t("admin.security.kindLabelProbeSuspected");
      if (kind === "rpc_denied") return t("admin.security.kindLabelRpcDenied");
      return kind;
    },
    [t],
  );
}

function SecurityLogPage() {
  const { t } = useT();
  const roleFn = useServerFn(hasRole);
  const eventsFn = useServerFn(listSecurityEvents);
  const alertsFn = useServerFn(listProbeAlerts);
  const WINDOWS = useWindows();
  const KINDS = useKinds();
  const kindLabel = useKindLabel();

  const [admin, setAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<SecurityEventRow[]>([]);
  const [alerts, setAlerts] = useState<ProbeAlertRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [windowMinutes, setWindowMinutes] = useState(1440);
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("all");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [events, probes] = await Promise.all([
        eventsFn({ data: { kind, windowMinutes, limit: 300 } }) as Promise<SecurityEventRow[]>,
        alertsFn({ data: { windowMinutes, threshold: 5 } }) as Promise<ProbeAlertRow[]>,
      ]);
      setRows(events);
      setAlerts(probes);
    } catch {
      setRows([]);
      setAlerts([]);
    } finally {
      setBusy(false);
    }
  }, [alertsFn, eventsFn, kind, windowMinutes]);

  useEffect(() => {
    void (async () => {
      try {
        setAdmin((await roleFn({ data: { role: "admin" } })) as boolean);
      } catch {
        setAdmin(false);
      }
    })();
  }, [roleFn]);

  useEffect(() => {
    if (admin) void load();
  }, [admin, load]);

  if (admin === false) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md py-16 text-center text-muted-foreground">
          {t("admin.adminOnly")}
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell module="security" title={t("admin.security.title")}>
      <>
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <Lock className="size-6 text-primary" />
                {t("admin.security.title")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("admin.security.subtitle")}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
              <RefreshCw className={cn("size-4", busy && "animate-spin")} />
              {t("admin.security.reload")}
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {WINDOWS.map((w) => (
              <Button
                key={w.value}
                size="sm"
                variant={windowMinutes === w.value ? "default" : "outline"}
                onClick={() => setWindowMinutes(w.value)}
              >
                {w.label}
              </Button>
            ))}
            <span className="mx-1 w-px bg-border" />
            {KINDS.map((k) => (
              <Button
                key={k.value}
                size="sm"
                variant={kind === k.value ? "default" : "outline"}
                onClick={() => setKind(k.value)}
              >
                {k.label}
              </Button>
            ))}
          </div>

          <Card className="mt-5 border-destructive/40">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Siren className="size-4 text-destructive" />
                {t("admin.security.probeAlertsTitle", { count: alerts.length })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {alerts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("admin.security.noProbeAlerts")}
                </p>
              )}
              {alerts.map((a) => (
                <div
                  key={a.userId ?? "anon"}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3"
                >
                  <ShieldAlert className="size-4 shrink-0 text-destructive" />
                  <span className="text-sm font-medium">{a.displayName}</span>
                  <span className="font-mono text-xs tabular-nums text-destructive">
                    {t("admin.security.probeSummary", { events: a.events, resources: a.resources })}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{a.kinds.join(", ")}</span>
                  <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                    {new Date(a.lastSeen).toLocaleString("vi-VN")}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="mt-5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("admin.security.recentEventsTitle", { count: rows.length })}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {rows.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("admin.security.noEvents")}</p>
              )}
              {rows.map((r) => (
                <div key={r.id} className="rounded-md border border-border/60 p-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span
                      className={cn(
                        "rounded-sm border px-1.5 py-0.5 text-xs",
                        r.kind === "probe_suspected"
                          ? "border-destructive/50 text-destructive"
                          : "border-border/60 text-muted-foreground",
                      )}
                    >
                      {kindLabel(r.kind)}
                    </span>
                    <span className="text-sm font-medium">{r.displayName}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {r.resource ?? "—"} · {r.operation ?? "—"} · {r.errorCode ?? "—"}
                    </span>
                    <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString("vi-VN")}
                    </span>
                  </div>
                  {r.message && <p className="mt-1 text-xs text-muted-foreground">{r.message}</p>}
                  {r.path && (
                    <p className="mt-1 font-mono text-2xs text-muted-foreground">{t("admin.security.pagePrefix", { path: r.path })}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <NotificationOutboxCard />
        </div>
      </>
    </AdminShell>
  );
}

/** Stuck or dead-lettered notification events, with a manual retry. */
function NotificationOutboxCard() {
  const listFn = useServerFn(listNotificationOutbox);
  const retryFn = useServerFn(retryNotificationEvent);
  const [rows, setRows] = useState<NotificationOutboxEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const data = (await listFn({ data: { status: "failed", limit: 50 } })) as NotificationOutboxEvent[];
      setRows(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    } finally {
      setBusy(false);
    }
  }, [listFn]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Thông báo thất bại</CardTitle>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
          <RefreshCw className={cn("mr-2 size-4", busy && "animate-spin")} />
          Tải lại
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {rows.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">Không có sự kiện thông báo nào thất bại.</p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-border/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs">{r.event_type}</span>
              <span className="font-mono text-2xs text-muted-foreground">{r.event_key}</span>
              <span className="ml-auto font-mono text-2xs text-muted-foreground">
                {r.attempts}/{r.max_attempts} lần thử
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await retryFn({ data: { id: r.id } });
                  await load();
                }}
              >
                Thử lại
              </Button>
            </div>
            {r.last_error && <p className="mt-1 text-xs text-destructive">{r.last_error}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
