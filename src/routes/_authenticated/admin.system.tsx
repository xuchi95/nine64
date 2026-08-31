import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Gauge,
  FileLock2,
  Activity,
  ListChecks,
  History,
  ToggleLeft,
  Settings2,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { hasRole } from "@/lib/auth.functions";
import {
  getSystemSecurityStatus,
  resetRateLimitAction,
  type SystemSecurityStatus,
} from "@/lib/adminSystem.functions";
import {
  getSystemSettings,
  getSystemSettingHistory,
  getSystemHealth,
  getSystemQueues,
  publishSystemSetting,
  saveSystemSettingDraft,
  runSystemQueueAction,
  type SystemSettingsPayload,
  type SystemSettingHistory,
  type SystemHealthPayload,
  type SystemQueuesPayload,
} from "@/lib/adminSystemSettings.functions";
import {
  SETTING_REGISTRY,
  settingDefinition,
  type SettingGroup,
  type SettingKey,
} from "@/lib/system/registry";
import { QUEUE_IDS, type QueueId } from "@/lib/system/queueTypes";

export const Route = createFileRoute("/_authenticated/admin/system")({
  head: () => ({
    meta: [
      { title: `Bảng điều khiển hệ thống · ${APP.name}` },
      {
        name: "description",
        content:
          "Trang quản trị nội bộ: cấu hình vận hành, sức khoẻ dịch vụ, hàng đợi, hạn mức chống spam và security header.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Bảng điều khiển hệ thống · ${APP.name}` },
      {
        property: "og:description",
        content: "Cấu hình runtime, sức khoẻ và hàng đợi của Nine64.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminSystemPage,
});

const PATHS = ["/", "/contact", "/game/preview", "/api/public/fairplay"] as const;
type HeaderPath = (typeof PATHS)[number];

const HIGH_IMPACT_WORD = "CONFIRM";

function fmt(value: unknown): string {
  if (typeof value === "string") return value === "" ? "—" : value;
  return JSON.stringify(value);
}

/* ------------------------------------------------------------------ */
/* Setting editor                                                      */
/* ------------------------------------------------------------------ */

type Row = SystemSettingsPayload["rows"][number];

function SettingEditor({
  row,
  onSaved,
}: {
  row: Row;
  onSaved: (message: string) => void;
}) {
  const { t } = useT();
  const def = settingDefinition(row.key as SettingKey);
  const publishFn = useServerFn(publishSystemSetting);
  const draftFn = useServerFn(saveSystemSettingDraft);

  const live = row.value;
  const initial = row.hasDraft ? row.draftValue : row.value;
  const [value, setValue] = useState<unknown>(initial);
  const [reason, setReason] = useState("");
  const [confirmWord, setConfirmWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(row.hasDraft ? row.draftValue : row.value);
  }, [row.hasDraft, row.draftValue, row.value]);

  const dirty = JSON.stringify(value) !== JSON.stringify(live);
  const needsConfirm = Boolean(def.highImpact) && dirty;

  const run = async (mode: "draft" | "publish") => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "draft") {
        const res = (await draftFn({
          data: { key: row.key, value, expectedVersion: row.version || null },
        })) as { ok: boolean; code?: string };
        if (!res.ok) throw new Error(res.code ?? "WRITE_FAILED");
        onSaved(t("asys.settings.draft.ok"));
      } else {
        if (needsConfirm && confirmWord !== HIGH_IMPACT_WORD) {
          throw new Error("CONFIRMATION_REQUIRED");
        }
        const res = (await publishFn({
          data: {
            key: row.key,
            value,
            reason,
            expectedVersion: row.version || null,
          },
        })) as { ok: boolean; code?: string; version?: number };
        if (!res.ok) {
          throw new Error(
            res.code === "VERSION_CONFLICT"
              ? t("asys.settings.conflict")
              : res.code === "REASON_TOO_SHORT"
                ? t("asys.settings.reasonShort")
                : res.code === "INVALID_VALUE"
                  ? t("asys.settings.invalid")
                  : (res.code ?? "WRITE_FAILED"),
          );
        }
        setReason("");
        setConfirmWord("");
        onSaved(t("asys.settings.published.ok", { v: res.version ?? 0 }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "write_failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-border/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-medium">{row.key}</span>
        <span className="rounded-sm border border-border/60 px-1.5 py-0.5 text-2xs text-muted-foreground">
          {def.scope === "server_only"
            ? t("asys.settings.serverOnly")
            : t("asys.settings.publicScope")}
        </span>
        <span className="text-2xs text-muted-foreground">
          {t("asys.settings.version", { v: row.version })}
        </span>
        {row.hasDraft && (
          <span className="rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-2xs text-amber-500">
            {t("asys.settings.draft")}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        {def.control === "boolean" && (
          <Switch
            checked={Boolean(value)}
            onCheckedChange={(v) => setValue(v)}
            aria-label={row.key}
          />
        )}
        {def.control === "number" && (
          <Input
            type="number"
            className="max-w-[180px]"
            min={def.min}
            max={def.max}
            value={Number(value ?? 0)}
            aria-label={row.key}
            onChange={(e) => setValue(Number(e.target.value))}
          />
        )}
        {def.control === "select" && (
          <select
            className="h-9 rounded-md border border-border/60 bg-background px-2 text-sm"
            value={String(value ?? "")}
            aria-label={row.key}
            onChange={(e) => setValue(e.target.value)}
          >
            {(def.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
        {(def.control === "text" || def.control === "textarea") && (
          <Textarea
            rows={2}
            className="text-sm"
            value={String(value ?? "")}
            aria-label={row.key}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        {def.control === "flags" && (
          <Textarea
            rows={2}
            className="font-mono text-xs"
            aria-label={row.key}
            value={JSON.stringify(value ?? {})}
            onChange={(e) => {
              try {
                setValue(JSON.parse(e.target.value));
                setError(null);
              } catch {
                setError(t("asys.settings.invalid"));
              }
            }}
          />
        )}
      </div>

      {dirty && (
        <p className="mt-2 text-2xs text-amber-500">
          {t("asys.settings.diff", { from: fmt(live), to: fmt(value) })}
        </p>
      )}

      {dirty && (
        <div className="mt-2 space-y-2">
          <Input
            value={reason}
            placeholder={t("asys.settings.reason")}
            onChange={(e) => setReason(e.target.value)}
          />
          {needsConfirm && (
            <Input
              value={confirmWord}
              placeholder={t("asys.settings.confirm", { word: HIGH_IMPACT_WORD })}
              onChange={(e) => setConfirmWord(e.target.value)}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("draft")}>
              {t("asys.settings.saveDraft")}
            </Button>
            <Button
              size="sm"
              disabled={busy || reason.trim().length < 10}
              onClick={() => void run("publish")}
            >
              {t("asys.settings.publish")}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-2xs text-destructive">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function AdminSystemPage() {
  const { t } = useT();
  const roleFn = useServerFn(hasRole);
  const statusFn = useServerFn(getSystemSecurityStatus);
  const resetFn = useServerFn(resetRateLimitAction);
  const settingsFn = useServerFn(getSystemSettings);
  const historyFn = useServerFn(getSystemSettingHistory);
  const healthFn = useServerFn(getSystemHealth);
  const queuesFn = useServerFn(getSystemQueues);
  const queueActionFn = useServerFn(runSystemQueueAction);
  const publishFn = useServerFn(publishSystemSetting);

  const [admin, setAdmin] = useState<boolean | null>(null);
  const [path, setPath] = useState<HeaderPath>("/");
  const [status, setStatus] = useState<SystemSecurityStatus | null>(null);
  const [settings, setSettings] = useState<SystemSettingsPayload | null>(null);
  const [history, setHistory] = useState<SystemSettingHistory>([]);
  const [health, setHealth] = useState<SystemHealthPayload | null>(null);
  const [queues, setQueues] = useState<SystemQueuesPayload | null>(null);
  const [selectedQueue, setSelectedQueue] = useState<QueueId>("notification_outbox");
  const [queueReason, setQueueReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    const results = await Promise.allSettled([
      statusFn({ data: { headerPath: path } }),
      settingsFn(),
      healthFn(),
      queuesFn({ data: { queue: selectedQueue } }),
      historyFn({ data: {} }),
    ]);
    if (results[0].status === "fulfilled") setStatus(results[0].value as SystemSecurityStatus);
    if (results[1].status === "fulfilled") setSettings(results[1].value as SystemSettingsPayload);
    if (results[2].status === "fulfilled") setHealth(results[2].value as SystemHealthPayload);
    if (results[3].status === "fulfilled") setQueues(results[3].value as SystemQueuesPayload);
    if (results[4].status === "fulfilled") setHistory(results[4].value as SystemSettingHistory);
    const failed = results.find((r) => r.status === "rejected");
    setError(
      failed && failed.status === "rejected"
        ? failed.reason instanceof Error
          ? failed.reason.message
          : "load_failed"
        : null,
    );
    setBusy(false);
  }, [statusFn, settingsFn, healthFn, queuesFn, historyFn, path, selectedQueue]);

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

  const queueAction = async (
    queue: QueueId,
    action: "retry" | "retry_failed" | "process_now" | "cancel",
    jobId?: string,
  ) => {
    if (queueReason.trim().length < 10) {
      setError(t("asys.settings.reasonShort"));
      return;
    }
    setBusy(true);
    try {
      const res = (await queueActionFn({
        data: { queue, action, reason: queueReason.trim(), ...(jobId ? { jobId } : {}) },
      })) as { ok: boolean; affected: number; code?: string };
      setNotice(res.ok ? t("asys.queue.done", { n: res.affected }) : (res.code ?? "failed"));
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "queue_failed");
    } finally {
      setBusy(false);
    }
  };

  const rollback = async (key: string, value: unknown, version: number) => {
    const current = settings?.rows.find((r) => r.key === key);
    setBusy(true);
    try {
      const res = (await publishFn({
        data: {
          key,
          value,
          reason: `Rollback về phiên bản ${version} từ bảng điều khiển hệ thống`,
          expectedVersion: current?.version ?? null,
          rollbackOf: version,
        },
      })) as { ok: boolean; code?: string; version?: number };
      setNotice(
        res.ok
          ? t("asys.settings.published.ok", { v: res.version ?? 0 })
          : res.code === "VERSION_CONFLICT"
            ? t("asys.settings.conflict")
            : (res.code ?? "failed"),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "rollback_failed");
    } finally {
      setBusy(false);
    }
  };

  const rowsByGroup = useMemo(() => {
    const map: Record<SettingGroup, Row[]> = {
      features: [],
      operations: [],
      limits: [],
      content: [],
    };
    for (const row of settings?.rows ?? []) {
      const def = SETTING_REGISTRY[row.key as SettingKey];
      if (def) map[def.group].push(row as Row);
    }
    return map;
  }, [settings]);

  if (admin === false) {
    return (
      <AdminShell module="system" title={t("asys.title")}>
        <div className="mx-auto max-w-md py-16 text-center text-muted-foreground">
          {t("admin.adminOnly")}
        </div>
      </AdminShell>
    );
  }

  const settingList = (rows: Row[]) => (
    <div className="space-y-2">
      {rows.map((row) => (
        <SettingEditor
          key={row.key}
          row={row}
          onSaved={(m) => {
            setNotice(m);
            void load();
          }}
        />
      ))}
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("adminc.dash.empty")}</p>
      )}
    </div>
  );

  return (
    <AdminShell module="system" title={t("asys.title")}>
      <div className="mx-auto max-w-5xl pb-12">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <ShieldCheck className="size-6 text-primary" />
              {t("asys.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("asys.subtitle")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
            <RefreshCw className={cn("size-4", busy && "animate-spin")} />
            {t("asys.reload")}
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
        {settings?.degraded && (
          <p className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-500">
            {t("asys.settings.degraded")}
          </p>
        )}

        <Tabs defaultValue="overview" className="mt-5">
          <TabsList className="flex w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="overview">{t("asys.tab.overview")}</TabsTrigger>
            <TabsTrigger value="features">{t("asys.tab.features")}</TabsTrigger>
            <TabsTrigger value="operations">{t("asys.tab.operations")}</TabsTrigger>
            <TabsTrigger value="queues">{t("asys.tab.queues")}</TabsTrigger>
            <TabsTrigger value="limits">{t("asys.tab.limits")}</TabsTrigger>
            <TabsTrigger value="health">{t("asys.tab.health")}</TabsTrigger>
            <TabsTrigger value="history">{t("asys.tab.history")}</TabsTrigger>
          </TabsList>

          {/* -------- Overview -------- */}
          <TabsContent value="overview" className="mt-4 space-y-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="size-4 text-primary" />
                  {t("asys.health.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {(health?.checks ?? []).map((c) => (
                  <HealthPill key={c.id} check={c} />
                ))}
                {!health && <p className="text-sm text-muted-foreground">{t("adminc.loading")}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="size-4 text-primary" />
                  {t("admin.system.secretsTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-xs text-muted-foreground">
                  {t("asys.settings.noSecrets")}
                </p>
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
                      <span className="ml-auto shrink-0 text-2xs text-muted-foreground">
                        {s.configured
                          ? t("admin.system.set")
                          : t("admin.system.unset")}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* -------- Features -------- */}
          <TabsContent value="features" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ToggleLeft className="size-4 text-primary" />
                  {t("asys.tab.features")}
                </CardTitle>
              </CardHeader>
              <CardContent>{settingList(rowsByGroup.features)}</CardContent>
            </Card>
          </TabsContent>

          {/* -------- Operations -------- */}
          <TabsContent value="operations" className="mt-4 space-y-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings2 className="size-4 text-primary" />
                  {t("asys.tab.operations")}
                </CardTitle>
              </CardHeader>
              <CardContent>{settingList(rowsByGroup.operations)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("asys.tab.limits")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {settingList(rowsByGroup.limits)}
                {settingList(rowsByGroup.content)}
              </CardContent>
            </Card>
          </TabsContent>

          {/* -------- Queues -------- */}
          <TabsContent value="queues" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListChecks className="size-4 text-primary" />
                  {t("asys.queue.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {QUEUE_IDS.map((q) => (
                    <Button
                      key={q}
                      size="sm"
                      variant={selectedQueue === q ? "default" : "outline"}
                      onClick={() => setSelectedQueue(q)}
                    >
                      {t(`asys.queue.${q}`)}
                    </Button>
                  ))}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {(queues?.queues ?? []).map((q) => (
                    <div key={q.id} className="rounded-md border border-border/60 p-3">
                      <p className="text-sm font-medium">{t(`asys.queue.${q.id}`)}</p>
                      <p className="mt-1 font-mono text-2xs text-muted-foreground">
                        {Object.entries(q.counts)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ") || "—"}
                      </p>
                      {q.oldestPendingAt && (
                        <p className="mt-1 text-2xs text-muted-foreground">
                          {t("asys.queue.oldest", {
                            time: new Date(q.oldestPendingAt).toLocaleString(),
                          })}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {q.supportsRetry && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void queueAction(q.id, "retry_failed")}
                          >
                            {t("asys.queue.retryFailed")}
                          </Button>
                        )}
                        {q.supportsProcessNow && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void queueAction(q.id, "process_now")}
                          >
                            {t("asys.queue.processNow")}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <Input
                  value={queueReason}
                  placeholder={t("asys.settings.reason")}
                  onChange={(e) => setQueueReason(e.target.value)}
                />

                <div className="space-y-2">
                  {(queues?.jobs ?? []).map((job) => (
                    <div
                      key={job.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 p-2"
                    >
                      <span className="font-mono text-2xs">{job.id.slice(0, 8)}</span>
                      <span className="rounded-sm border border-border/60 px-1.5 py-0.5 text-2xs">
                        {job.status}
                      </span>
                      {job.reference && (
                        <span className="text-2xs text-muted-foreground">{job.reference}</span>
                      )}
                      {job.error && (
                        <span className="w-full break-all font-mono text-2xs text-destructive">
                          {job.error}
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto"
                        disabled={busy}
                        onClick={() => void queueAction(selectedQueue, "retry", job.id)}
                      >
                        {t("asys.queue.retry")}
                      </Button>
                    </div>
                  ))}
                  {(queues?.jobs ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("asys.queue.empty")}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* -------- Rate limits -------- */}
          <TabsContent value="limits" className="mt-4 space-y-5">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gauge className="size-4 text-primary" />
                  {t("admin.system.limitsTitle")}
                </CardTitle>
                <Button variant="destructive" size="sm" onClick={() => void reset()} disabled={busy}>
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
                      {l.failClosed ? t("admin.system.failClosed") : t("admin.system.failOpen")}
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

            <Card>
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
          </TabsContent>

          {/* -------- Health -------- */}
          <TabsContent value="health" className="mt-4 space-y-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("asys.health.title")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {(health?.checks ?? []).map((c) => (
                  <HealthPill key={c.id} check={c} detailed />
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("asys.health.env")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {(health?.environment ?? []).map((e) => (
                  <div
                    key={e.name}
                    className="flex items-center gap-2 rounded-md border border-border/60 p-2"
                  >
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        e.configured ? "bg-emerald-500" : "bg-muted-foreground/50",
                      )}
                    />
                    <span className="truncate font-mono text-xs">{e.name}</span>
                    <span className="ml-auto text-2xs text-muted-foreground">{e.group}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            {health?.build && (
              <p className="font-mono text-2xs text-muted-foreground">
                {t("asys.health.build")}: {health.build.mode} ·{" "}
                {health.build.version ?? "—"} · {health.build.commit ?? "—"} ·{" "}
                {health.build.deployedAt ?? "—"}
              </p>
            )}
          </TabsContent>

          {/* -------- History -------- */}
          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="size-4 text-primary" />
                  {t("asys.tab.history")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {history.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("asys.hist.empty")}</p>
                )}
                {history.map((h) => (
                  <div key={h.id} className="rounded-md border border-border/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-medium">{h.key}</span>
                      <span className="text-2xs text-muted-foreground">v{h.version}</span>
                      {h.rollbackOf !== null && (
                        <span className="text-2xs text-amber-500">
                          {t("asys.hist.rollbackOf", { v: h.rollbackOf })}
                        </span>
                      )}
                      <span className="ml-auto text-2xs text-muted-foreground">
                        {new Date(h.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-2xs text-muted-foreground">
                      {fmt(h.previousValue)} → {fmt(h.value)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{h.reason}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={busy}
                      onClick={() => void rollback(h.key, h.value, h.version)}
                    >
                      {t("asys.hist.rollback")}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminShell>
  );
}

function HealthPill({
  check,
  detailed,
}: {
  check: SystemHealthPayload["checks"][number];
  detailed?: boolean;
}) {
  const { t } = useT();
  const color =
    check.state === "healthy"
      ? "bg-emerald-500"
      : check.state === "degraded"
        ? "bg-amber-500"
        : check.state === "unavailable"
          ? "bg-destructive"
          : "bg-muted-foreground/50";
  return (
    <div className="rounded-md border border-border/60 p-3">
      <div className="flex items-center gap-2">
        <span className={cn("size-2 rounded-full", color)} />
        <span className="text-sm font-medium">{t(`asys.health.check.${check.id}`)}</span>
        <span className="ml-auto text-2xs text-muted-foreground">
          {t(`asys.health.state.${check.state}`)}
        </span>
      </div>
      <p className="mt-1 text-2xs text-muted-foreground">{check.detail}</p>
      {detailed && check.latencyMs !== null && (
        <p className="mt-0.5 font-mono text-2xs text-muted-foreground">{check.latencyMs}ms</p>
      )}
    </div>
  );
}
