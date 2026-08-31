import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, RefreshCw, ShieldCheck, Gauge, FileLock2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AdminMfaGate } from "@/components/admin/AdminMfaGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { hasRole } from "@/lib/auth.functions";
import {
  getSystemSecurityStatus,
  resetRateLimitAction,
  type SystemSecurityStatus,
} from "@/lib/adminSystem.functions";

export const Route = createFileRoute("/_authenticated/admin/system")({
  head: () => ({
    meta: [
      { title: `Bảng điều khiển hệ thống · ${APP.name}` },
      {
        name: "description",
        content:
          "Trang quản trị nội bộ: tình trạng biến môi trường, hạn mức chống spam và các security header đang áp dụng.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Bảng điều khiển hệ thống · ${APP.name}` },
      {
        property: "og:description",
        content: "Secret, hạn mức limiter và CSP thực tế của Nine64.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminSystemPage,
});

const PATHS = ["/", "/contact", "/game/preview", "/api/public/fairplay"] as const;
type HeaderPath = (typeof PATHS)[number];

function AdminSystemPage() {
  const { t } = useT();
  const roleFn = useServerFn(hasRole);
  const statusFn = useServerFn(getSystemSecurityStatus);
  const resetFn = useServerFn(resetRateLimitAction);

  const [admin, setAdmin] = useState<boolean | null>(null);
  const [path, setPath] = useState<HeaderPath>("/");
  const [status, setStatus] = useState<SystemSecurityStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const data = (await statusFn({ data: { headerPath: path } })) as SystemSecurityStatus;
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    } finally {
      setBusy(false);
    }
  }, [statusFn, path]);

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

  const reset = async (action?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = (await resetFn({ data: action ? { action } : {} })) as { cleared: number };
      setNotice(t("admin.system.resetDone", { count: res.cleared, action: action ?? "*" }));
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "reset_failed");
    } finally {
      setBusy(false);
    }
  };

  if (admin === false) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md py-16 text-center text-muted-foreground">
          {t("admin.adminOnly")}
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
                <ShieldCheck className="size-6 text-primary" />
                {t("admin.system.title")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("admin.system.subtitle")}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
              <RefreshCw className={cn("size-4", busy && "animate-spin")} />
              {t("admin.system.reload")}
            </Button>
          </div>

          {error && (
            <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && (
            <p className="mt-4 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm text-primary">
              {notice}
            </p>
          )}

          {/* Secrets */}
          <Card className="mt-5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="size-4 text-primary" />
                {t("admin.system.secretsTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-muted-foreground">{t("admin.system.secretsHint")}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(status?.secrets ?? []).map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center gap-2 rounded-md border border-border/60 p-2"
                  >
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        s.configured
                          ? "bg-emerald-500"
                          : s.required
                            ? "bg-destructive"
                            : "bg-muted-foreground/50",
                      )}
                    />
                    <span className="truncate font-mono text-xs">{s.name}</span>
                    <span className="ml-auto shrink-0 rounded-sm border border-border/60 px-1.5 py-0.5 text-2xs text-muted-foreground">
                      {s.group === "public"
                        ? t("admin.system.groupPublic")
                        : t("admin.system.groupServer")}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-2xs",
                        s.configured ? "text-emerald-500" : "text-muted-foreground",
                      )}
                    >
                      {s.configured ? t("admin.system.set") : t("admin.system.unset")}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Rate limiter */}
          <Card className="mt-5">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="size-4 text-primary" />
                {t("admin.system.limitsTitle")}
              </CardTitle>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void reset()}
                disabled={busy}
              >
                {t("admin.system.resetAll")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {(status?.limits ?? []).map((l) => (
                <div
                  key={l.action}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border/60 p-3"
                >
                  <span className="font-mono text-xs font-medium">{l.action}</span>
                  <span className="rounded-sm border border-border/60 px-1.5 py-0.5 text-2xs text-muted-foreground">
                    {l.scope}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {t("admin.system.quota", { limit: l.limit, window: l.windowSeconds })}
                  </span>
                  <span
                    className={cn(
                      "text-2xs",
                      l.failClosed ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {l.failClosed
                      ? t("admin.system.failClosed")
                      : t("admin.system.failOpen")}
                  </span>
                  <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                    {t("admin.system.live", {
                      buckets: l.activeBuckets,
                      peak: l.peakCount,
                      blocked: l.blocked,
                    })}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || l.activeBuckets === 0}
                    onClick={() => void reset(l.action)}
                  >
                    {t("admin.system.reset")}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Headers / CSP */}
          <Card className="mt-5 mb-10">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileLock2 className="size-4 text-primary" />
                {t("admin.system.headersTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-2">
                {PATHS.map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={path === p ? "default" : "outline"}
                    onClick={() => setPath(p)}
                  >
                    <span className="font-mono text-xs">{p}</span>
                  </Button>
                ))}
              </div>
              {status?.meta && (
                <p className="mb-3 font-mono text-2xs text-muted-foreground">
                  {t("admin.system.headerMeta", {
                    mode: status.meta.production ? "production" : "development",
                    preview: status.meta.previewHost ? "yes" : "no",
                    eval: status.meta.turnstileEval ? "yes" : "no",
                  })}
                </p>
              )}
              <div className="space-y-2">
                {(status?.headers ?? []).map((h) => (
                  <div key={h.name} className="rounded-md border border-border/60 p-2">
                    <p className="font-mono text-xs font-medium">{h.name}</p>
                    <p className="mt-0.5 break-all font-mono text-2xs text-muted-foreground">
                      {h.value}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </AdminMfaGate>
    </AppShell>
  );
}
