import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Cpu, Gauge, History, RefreshCw, ShieldAlert } from "lucide-react";
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
import {
  getEngineOverview,
  getEngineVersions,
  publishEngineProfile,
  runEngineBenchmark,
  saveEngineDraft,
  disableEngineProfile,
  type EngineOverview,
} from "@/lib/adminEngine.functions";
import { engineConfigSchema, TITAN_SLUG, type EngineConfig } from "@/lib/engine/profileTypes";
import { BENCHMARK_KINDS } from "@/lib/engine/benchmarkTypes";

export const Route = createFileRoute("/_authenticated/admin/engine")({
  head: () => ({
    meta: [
      { title: `Máy cờ · ${APP.name}` },
      {
        name: "description",
        content: "Quản trị hồ sơ máy cờ Nine64 Titan, benchmark, phiên chơi và trạng thái dịch vụ engine.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Máy cờ · ${APP.name}` },
      {
        property: "og:description",
        content: "Hồ sơ engine, benchmark và tình trạng dịch vụ Cloud Engine của Nine64.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminEnginePage,
});

const HEALTH_TONE: Record<string, string> = {
  healthy: "text-emerald-400",
  degraded: "text-amber-400",
  unavailable: "text-destructive",
  not_configured: "text-muted-foreground",
};

type NumericKey = {
  [K in keyof EngineConfig]: EngineConfig[K] extends number | null ? K : never;
}[keyof EngineConfig];

const NUMERIC_FIELDS: { key: NumericKey; label: string }[] = [
  { key: "moveTimeMs", label: "Move time (ms)" },
  { key: "maxMoveTimeMs", label: "Max move time (ms)" },
  { key: "clockFraction", label: "Clock fraction" },
  { key: "threads", label: "Threads" },
  { key: "hashMb", label: "Hash (MB)" },
  { key: "multiPv", label: "MultiPV" },
  { key: "moveOverheadMs", label: "Move overhead (ms)" },
  { key: "skill", label: "Skill Level" },
  { key: "uciElo", label: "UCI Elo" },
  { key: "syzygyPieces", label: "Syzygy pieces" },
  { key: "syzygyProbeLimit", label: "Syzygy probe limit" },
  { key: "openingRandomness", label: "Opening randomness" },
  { key: "personalityTolerance", label: "Personality tolerance (cp)" },
  { key: "perUserDailyMoves", label: "Per-user daily moves" },
  { key: "maxConcurrentGames", label: "Max concurrent games" },
  { key: "requestTimeoutMs", label: "Request timeout (ms)" },
  { key: "maxRetries", label: "Max retries" },
];

const BOOL_FIELDS: { key: keyof EngineConfig; label: string }[] = [
  { key: "limitStrength", label: "UCI_LimitStrength" },
  { key: "ponder", label: "Ponder" },
  { key: "syzygyEnabled", label: "Syzygy enabled" },
];

function AdminEnginePage() {
  const { t } = useT();
  const load = useServerFn(getEngineOverview);
  const saveDraft = useServerFn(saveEngineDraft);
  const publish = useServerFn(publishEngineProfile);
  const bench = useServerFn(runEngineBenchmark);
  const disable = useServerFn(disableEngineProfile);
  const versionsFn = useServerFn(getEngineVersions);

  const [data, setData] = useState<EngineOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<EngineConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [reason, setReason] = useState("");
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof getEngineVersions>>>([]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const next = await load();
      setData(next);
      const titan = next.profiles.find((p) => p.slug === TITAN_SLUG) ?? next.profiles[0] ?? null;
      if (titan) {
        setDraft(titan.hasDraft ? titan.draftConfig : titan.config);
        setEnabled(titan.enabled);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const titan = data?.profiles.find((p) => p.slug === TITAN_SLUG) ?? data?.profiles[0] ?? null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = (await fn()) as { ok?: boolean; code?: string } | undefined;
      if (result && result.ok === false) setNotice(result.code ?? t("adminc.common.failed"));
      else setNotice(t("adminc.common.saved"));
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t("adminc.common.failed"));
    } finally {
      setBusy(false);
    }
  };

  const setNumber = (key: NumericKey, raw: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const value = raw.trim() === "" ? null : Number(raw);
      return { ...prev, [key]: Number.isNaN(value as number) ? prev[key] : value } as EngineConfig;
    });
  };

  const parsed = draft ? engineConfigSchema.safeParse(draft) : null;
  const reasonValid = reason.trim().length >= 10;

  return (
    <AdminShell module="engine" title={t("adminc.engine.title")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("adminc.engine.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("adminc.engine.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw className="mr-2 h-4 w-4" /> {t("adminc.common.refresh")}
        </Button>
      </div>

      <p className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        {t("adminc.engine.attribution")}
      </p>

      {error ? (
        <Card className="mt-4 border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}
      {notice ? (
        <Card className="mt-4">
          <CardContent className="p-3 text-sm">{notice}</CardContent>
        </Card>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4" /> {t("adminc.engine.service")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className={cn("font-semibold", HEALTH_TONE[data?.health.status ?? ""] ?? "")}>
              {data?.health.status ?? "…"}
            </p>
            <p className="text-xs text-muted-foreground">{data?.health.detail ?? ""}</p>
            <p className="font-mono text-xs">
              {data?.health.engineVersion ?? "—"} · {data?.health.latencyMs ?? "—"}ms
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              pool {data?.health.pool ? `${data.health.pool.busy}/${data.health.pool.size}` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldAlert className="h-4 w-4" /> {t("adminc.engine.breaker")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-semibold">{data?.breaker.open ? "OPEN" : "CLOSED"}</p>
            <p className="font-mono text-xs text-muted-foreground">failures: {data?.breaker.failures ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Gauge className="h-4 w-4" /> {t("adminc.engine.readiness")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className={cn("font-semibold", data?.readiness.ready ? "text-emerald-400" : "text-amber-400")}>
              {data?.readiness.ready ? t("adminc.engine.ready") : t("adminc.engine.notReady")}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {(data?.readiness.reasons ?? []).join(", ") || "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="md:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldAlert className="h-4 w-4" /> Backend secrets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p
              className={cn(
                "font-semibold",
                data?.env.ok ? "text-emerald-400" : "text-amber-400",
              )}
            >
              {data?.env.code ?? "…"}
            </p>
            <div className="flex flex-wrap gap-2 font-mono text-xs">
              {Object.entries(data?.env.present ?? {}).map(([name, present]) => (
                <span
                  key={name}
                  className={cn(
                    "rounded border px-2 py-0.5",
                    present ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400",
                  )}
                >
                  {name}: {present ? "configured" : "missing"}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="profiles" className="mt-6">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="profiles">{t("adminc.engine.tab.profiles")}</TabsTrigger>
          <TabsTrigger value="sessions">{t("adminc.engine.tab.sessions")}</TabsTrigger>
          <TabsTrigger value="benchmarks">{t("adminc.engine.tab.benchmarks")}</TabsTrigger>
          <TabsTrigger value="versions">{t("adminc.engine.tab.versions")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profiles" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Cpu className="h-4 w-4" /> {titan?.name ?? "Nine64 Titan"} · v{titan?.version ?? 0} ·{" "}
                {titan?.status ?? "draft"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!draft ? (
                <p className="text-sm text-muted-foreground">{t("adminc.loading")}</p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {NUMERIC_FIELDS.map((field) => (
                      <label key={field.key} className="space-y-1 text-xs">
                        <span className="text-muted-foreground">{field.label}</span>
                        <Input
                          inputMode="decimal"
                          value={draft[field.key] === null ? "" : String(draft[field.key])}
                          onChange={(e) => setNumber(field.key, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {BOOL_FIELDS.map((field) => (
                      <label key={String(field.key)} className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={Boolean(draft[field.key])}
                          onCheckedChange={(v) =>
                            setDraft((prev) => (prev ? ({ ...prev, [field.key]: v } as EngineConfig) : prev))
                          }
                        />
                        {field.label}
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-xs">
                      <Switch checked={enabled} onCheckedChange={setEnabled} />
                      {t("adminc.engine.enabled")}
                    </label>
                  </div>
                  {parsed && !parsed.success ? (
                    <p className="text-xs text-destructive">
                      {parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · ")}
                    </p>
                  ) : null}
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("adminc.engine.reason")}
                    rows={2}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !parsed?.success || !titan}
                      onClick={() =>
                        void run(() =>
                          saveDraft({
                            data: {
                              slug: titan!.slug,
                              config: parsed!.data,
                              expectedVersion: titan!.version,
                            },
                          }),
                        )
                      }
                    >
                      {t("adminc.engine.saveDraft")}
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy || !parsed?.success || !reasonValid || !titan}
                      onClick={() =>
                        void run(() =>
                          publish({
                            data: {
                              slug: titan!.slug,
                              config: parsed!.data,
                              status: "published",
                              enabled,
                              reason: reason.trim(),
                              expectedVersion: titan!.version,
                              ignoreReadiness: false,
                            },
                          }),
                        )
                      }
                    >
                      {t("adminc.engine.publish")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={busy || !reasonValid || !titan}
                      onClick={() =>
                        void run(() => disable({ data: { slug: titan!.slug, reason: reason.trim() } }))
                      }
                    >
                      {t("adminc.engine.disable")}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {(data?.sessions.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">{t("adminc.engine.noSessions")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-2">ID</th>
                        <th>Level</th>
                        <th>Plies</th>
                        <th>Version</th>
                        <th>Updated</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {data!.sessions.map((s) => (
                        <tr key={s.id} className="border-t border-border/40">
                          <td className="py-2">{s.id.slice(0, 8)}</td>
                          <td>{s.level}</td>
                          <td>{s.plies}</td>
                          <td>{s.version}</td>
                          <td>{new Date(s.updatedAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="benchmarks" className="mt-4 space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap gap-2">
                {BENCHMARK_KINDS.map((kind) => (
                  <Button
                    key={kind}
                    size="sm"
                    variant="outline"
                    disabled={busy || !reasonValid}
                    onClick={() => void run(() => bench({ data: { kind, reason: reason.trim() } }))}
                  >
                    {t("adminc.engine.runBench")}: {kind}
                  </Button>
                ))}
              </div>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("adminc.engine.reason")}
                rows={2}
              />
              {(data?.benchmarks.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">{t("adminc.engine.noBench")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-2">Kind</th>
                        <th>Engine</th>
                        <th>NPS</th>
                        <th>Nodes</th>
                        <th>Depth</th>
                        <th>Score</th>
                        <th>Passed</th>
                        <th>At</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {data!.benchmarks.map((b) => (
                        <tr key={b.id} className="border-t border-border/40">
                          <td className="py-2">{b.kind}</td>
                          <td>{b.engineVersion}</td>
                          <td>{b.nps ?? "—"}</td>
                          <td>{b.nodes ?? "—"}</td>
                          <td>{b.depth ?? "—"}</td>
                          <td>{b.score ?? "—"}</td>
                          <td className={b.passed ? "text-emerald-400" : "text-destructive"}>
                            {b.passed ? "yes" : "no"}
                          </td>
                          <td>{new Date(b.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="versions" className="mt-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <Button
                size="sm"
                variant="outline"
                disabled={!titan || busy}
                onClick={async () => setVersions(await versionsFn({ data: { slug: titan!.slug } }))}
              >
                <History className="mr-2 h-4 w-4" /> {t("adminc.common.refresh")}
              </Button>
              {versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {versions.map((v) => (
                    <li key={v.version} className="rounded border border-border/40 p-2">
                      <p className="font-mono">
                        v{v.version} · {new Date(v.createdAt).toLocaleString()}
                      </p>
                      <p className="text-muted-foreground">{v.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}
