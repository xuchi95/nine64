import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, ShieldAlert, Siren, Lock } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AdminMfaGate } from "@/components/admin/AdminMfaGate";
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
import { cn } from "@/lib/utils";

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

const WINDOWS = [
  { label: "1 giờ", value: 60 },
  { label: "24 giờ", value: 1440 },
  { label: "7 ngày", value: 10080 },
];

const KINDS = [
  { label: "Tất cả", value: "all" as const },
  { label: "Bị từ chối", value: "access_denied" as const },
  { label: "Nghi dò quyền", value: "probe_suspected" as const },
  { label: "RPC chặn", value: "rpc_denied" as const },
];

function kindLabel(kind: string): string {
  if (kind === "access_denied") return "Truy cập bị từ chối";
  if (kind === "probe_suspected") return "Nghi dò quyền";
  if (kind === "rpc_denied") return "Hàm máy chủ từ chối";
  return kind;
}

function SecurityLogPage() {
  const roleFn = useServerFn(hasRole);
  const eventsFn = useServerFn(listSecurityEvents);
  const alertsFn = useServerFn(listProbeAlerts);

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
          Trang này chỉ dành cho quản trị viên.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      <AdminMfaGate>
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <Lock className="size-6 text-primary" />
                Nhật ký truy cập bị từ chối
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Mọi truy vấn bị phân quyền chặn đều được ghi lại. Nhiều lần từ chối liên tiếp sẽ được nâng
                thành cảnh báo dò quyền.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
              <RefreshCw className={cn("size-4", busy && "animate-spin")} />
              Tải lại
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
                Cảnh báo dò quyền ({alerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {alerts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Không có tài khoản nào vượt ngưỡng 5 lần bị từ chối trong khoảng thời gian này.
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
                    {a.events} lần từ chối · {a.resources} tài nguyên
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
              <CardTitle className="text-base">Sự kiện gần đây ({rows.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {rows.length === 0 && (
                <p className="text-sm text-muted-foreground">Chưa ghi nhận truy cập bị từ chối nào.</p>
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
                    <p className="mt-1 font-mono text-2xs text-muted-foreground">Trang: {r.path}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </AdminMfaGate>
    </AppShell>
  );
}
