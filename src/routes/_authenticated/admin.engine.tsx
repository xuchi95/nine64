import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, CheckCircle2, Cpu, Gauge, History, RefreshCw, ShieldAlert } from "lucide-react";
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
  checkEngineConnection,
  runTitanQualificationSuite,
  runTitanSelfPlayRegression,
  recommendTitanDraft,
  type EngineOverview,
} from "@/lib/adminEngine.functions";
import {
  engineConfigSchema,
  TITAN_SLUG,
  titanFullStrengthViolations,
  type EngineConfig,
} from "@/lib/engine/profileTypes";
import { resourceFit } from "@/lib/engine/capabilities";
import { BENCHMARK_KINDS, type BenchmarkRow } from "@/lib/engine/benchmarkTypes";
import type { QualificationResult } from "@/lib/engine/qualificationTypes";
import type { SelfPlayRegression } from "@/lib/engine/selfplayTypes";

/** Typed, secret-free failure summary for a benchmark row. */
function benchmarkIssues(row: BenchmarkRow): string {
  const detail = row.result ?? {};
  const reasons = Array.isArray(detail["failureReasons"]) ? (detail["failureReasons"] as string[]) : [];
  const counts = (["illegalMoves", "noMove", "timeouts", "engineErrors"] as const)
    .map((key) => [key, Number(detail[key] ?? 0)] as const)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `${key}=${value}`);
  return [...new Set([...reasons, ...counts])].join(", ");
}

type DetailField = { key: string; value: string; tone?: string | undefined };

/** Flattens a benchmark row into labelled diagnostic fields (no secrets). */
function benchmarkDetailFields(row: import("@/lib/engine/benchmarkTypes").BenchmarkRow): DetailField[] {
  const d = row.result ?? {};
  const hw = row.hardware ?? {};
  const num = (key: string): number | null => {
    const raw = d[key] ?? hw[key];
    return typeof raw === "number" ? raw : null;
  };
  const show = (value: number | null) => (value === null ? "—" : String(value));
  const durationMs = num("durationMs") ?? num("elapsedMs") ?? num("totalTimeMs");
  const solved = num("solved");
  const total = num("total");
  const bad = (value: number | null) => ((value ?? 0) > 0 ? "text-destructive" : undefined);

  return [
    { key: "status", value: row.passed ? "OK" : "FAIL", tone: row.passed ? "text-emerald-400" : "text-destructive" },
    { key: "kind", value: row.kind },
    { key: "engineVersion", value: row.engineVersion || "—" },
    { key: "fingerprint", value: row.configSignature ? `${row.configSignature.slice(0, 12)}…` : "—" },
    { key: "nps", value: show(row.nps) },
    { key: "nodes", value: show(row.nodes) },
    { key: "depth", value: show(row.depth) },
    { key: "score", value: row.score === null ? "—" : String(row.score) },
    {
      key: "passed",
      value: row.passed ? "yes" : "no",
      tone: row.passed ? "text-emerald-400" : "text-destructive",
    },
    { key: "solved", value: total === null ? "—" : `${solved ?? 0} / ${total}` },
    { key: "legalMoves", value: show(num("legalMoves")) },
    { key: "illegalMoves", value: show(num("illegalMoves")), tone: bad(num("illegalMoves")) },
    { key: "noMove", value: show(num("noMove")), tone: bad(num("noMove")) },
    { key: "timeouts", value: show(num("timeouts")), tone: bad(num("timeouts")) },
    { key: "engineErrors", value: show(num("engineErrors")), tone: bad(num("engineErrors")) },
    { key: "duration", value: durationMs === null ? "—" : `${(durationMs / 1000).toFixed(1)}s` },
    { key: "createdAt", value: new Date(row.createdAt).toLocaleString() },
  ];
}

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
  unauthorized: "text-destructive",
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
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [draft, setDraft] = useState<EngineConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [reason, setReason] = useState("");
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof getEngineVersions>>>([]);
  const probe = useServerFn(checkEngineConnection);
  const recommend = useServerFn(recommendTitanDraft);
  const [probeResult, setProbeResult] = useState<string | null>(null);
  const qualify = useServerFn(runTitanQualificationSuite);
  const selfPlay = useServerFn(runTitanSelfPlayRegression);
  const [regression, setRegression] = useState<SelfPlayRegression | null>(null);
  const [regressionBusy, setRegressionBusy] = useState(false);
  const [qual, setQual] = useState<QualificationResult | null>(null);
  const [qualBusy, setQualBusy] = useState(false);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});

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

  const run = async (fn: () => Promise<unknown>, successText?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = (await fn()) as { ok?: boolean; code?: string } | undefined;
      if (result && result.ok === false) {
        setNotice({ kind: "error", text: result.code ?? t("adminc.common.failed") });
      } else {
        setNotice({ kind: "success", text: successText ?? t("adminc.common.saved") });
      }
      await refresh();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("adminc.common.failed") });
    } finally {
      setBusy(false);
    }
  };

  /** One atomic qualification suite; every step keeps its own benchmark row. */
  const runQualification = async () => {
    if (!titan || !parsed?.success) return;
    setQualBusy(true);
    setNotice(null);
    setQual(null);
    try {
      const result = await qualify({
        data: { reason: reason.trim(), slug: titan.slug, config: parsed.data },
      });
      setQual(result as QualificationResult);
      await refresh();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("adminc.common.failed") });
    } finally {
      setQualBusy(false);
    }
  };

  /** Candidate draft vs the published live config on the same engine. */
  const runRegression = async () => {
    if (!titan || !parsed?.success) return;
    setRegressionBusy(true);
    setNotice(null);
    setRegression(null);
    try {
      const result = await selfPlay({
        data: { reason: reason.trim(), slug: titan.slug, config: parsed.data, games: 4, moveTimeMs: 250 },
      });
      setRegression(result as SelfPlayRegression);
      await refresh();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("adminc.common.failed") });
    } finally {
      setRegressionBusy(false);
    }
  };

  const setNumber = (key: NumericKey, raw: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const value = raw.trim() === "" ? null : Number(raw);
      return { ...prev, [key]: Number.isNaN(value as number) ? prev[key] : value } as EngineConfig;
    });
  };

  const caps = data?.health.capabilities ?? null;
  const strengthViolations = draft && titan?.slug === TITAN_SLUG ? titanFullStrengthViolations(draft) : [];
  const fit = resourceFit(draft ?? ({} as EngineConfig), caps);
  /** Only the fields that really differ between draft and the live profile. */
  const publishedDiff = draft && titan
    ? (Object.keys(draft) as (keyof EngineConfig)[])
        .filter((key) => JSON.stringify(draft[key]) !== JSON.stringify(titan.config[key]))
        .map((key) => `${String(key)}: ${JSON.stringify(titan.config[key])} → ${JSON.stringify(draft[key])}`)
    : [];

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
        <Card
          className={
            notice.kind === "success"
              ? "mt-4 border-emerald-500/50 bg-emerald-500/10"
              : "mt-4 border-destructive/50 bg-destructive/10"
          }
          role="status"
        >
          <CardContent className="flex items-center gap-2 p-3 text-sm font-medium">
            {notice.kind === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
            )}
            {notice.text}
          </CardContent>
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
              {data?.health.arch ?? "—"} · pool{" "}
              {data?.health.pool ? `${data.health.pool.busy}/${data.health.pool.size}` : "—"}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              searches {data?.health.stats?.searches ?? 0} · timeouts {data?.health.stats?.timeouts ?? 0} ·
              restarts {data?.health.stats?.restarts ?? 0} · illegal {data?.health.stats?.illegal ?? 0}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {data?.health.checkedAt ? new Date(data.health.checkedAt).toLocaleTimeString() : "—"}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setProbeResult(null);
                void run(async () => {
                  const res = await probe({ data: {} });
                  setProbeResult(
                    res.ok
                      ? `Đã kết nối Nine64 Titan · ${res.health?.engineVersion ?? "engine"}`
                      : res.code,
                  );
                  return res;
                });
              }}
            >
              Kiểm tra kết nối
            </Button>
            {probeResult ? <p className="text-xs">{probeResult}</p> : null}
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
            {(data?.readiness.reasons ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">—</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {data!.readiness.reasons.map((code) => (
                  <li key={code}>
                    <p className="text-xs text-amber-300">{t(`adminc.engine.reason.${code}`)}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{code}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="md:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Cpu className="h-4 w-4" /> {t("adminc.engine.inspector")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-muted-foreground">{t("adminc.engine.hardware")}</p>
              <p className="font-mono">
                {caps ? `${caps.cpuCount} vCPU · ${caps.memoryMb} MB · pool ${caps.poolSize}` : "—"}
              </p>
              <p className="font-mono text-muted-foreground">
                {caps ? `threads ≤ ${caps.maxThreadsPerEngine} · hash ≤ ${caps.maxSafeHashMb} MB` : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Syzygy</p>
              <p className="font-mono">
                {caps ? (caps.syzygyReady ? `ready · ${caps.syzygyPieces}p` : "not installed") : "—"}
              </p>
              <p className="text-muted-foreground">{t("adminc.engine.suite")}</p>
              <p className="font-mono">{data?.health.benchmarkSuiteVersion ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("adminc.engine.fullStrength")}</p>
              <p className={cn("font-semibold", strengthViolations.length ? "text-destructive" : "text-emerald-400")}>
                {strengthViolations.length ? t("adminc.engine.fail") : t("adminc.engine.ok")}
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">{strengthViolations.join(", ") || "—"}</p>
              <p className="mt-1 text-muted-foreground">{t("adminc.engine.resourceFit")}</p>
              <p className={cn("font-semibold", fit.ok ? "text-emerald-400" : "text-destructive")}>
                {fit.ok ? t("adminc.engine.ok") : t("adminc.engine.fail")}
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">{fit.reasons.join(", ") || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("adminc.engine.diff")}</p>
              {publishedDiff.length === 0 ? (
                <p className="text-muted-foreground">{t("adminc.engine.noDiff")}</p>
              ) : (
                <ul className="space-y-0.5 font-mono text-[10px]">
                  {publishedDiff.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    setNotice(null);
                    const res = (await recommend({ data: {} })) as
                      | { ok: true; config: EngineConfig }
                      | { ok: false; code: string };
                    if (res.ok) {
                      setDraft(res.config);
                      setNotice({ kind: "success", text: t("adminc.engine.recommended") });
                    } else {
                      setNotice({ kind: "error", text: res.code });
                    }
                  })()
                }
              >
                {t("adminc.engine.recommend")}
              </Button>
            </div>
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
                        void run(
                          () =>
                            saveDraft({
                              data: {
                                slug: titan!.slug,
                                config: parsed!.data,
                                expectedVersion: titan!.version,
                              },
                            }),
                          t("adminc.engine.draftSaved"),
                        )
                      }
                    >
                      {t("adminc.engine.saveDraft")}
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy || !parsed?.success || !reasonValid || !titan}
                      onClick={() =>
                        void run(
                          () =>
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
                          t("adminc.engine.published").replace("{v}", String(titan!.version + 1)),
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
                        void run(
                          () => disable({ data: { slug: titan!.slug, reason: reason.trim() } }),
                          t("adminc.engine.disabled"),
                        )
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
              <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{t("adminc.engine.qualify.title")}</p>
                    <p className="text-xs text-muted-foreground">{t("adminc.engine.qualify.hint")}</p>
                  </div>
                  <Button
                    size="sm"
                    disabled={busy || qualBusy || !reasonValid || !parsed?.success || !titan}
                    onClick={() => void runQualification()}
                  >
                    <Gauge className="mr-2 h-4 w-4" />
                    {qualBusy ? t("adminc.engine.qualify.running") : t("adminc.engine.qualify.run")}
                  </Button>
                </div>
                {qual && (
                  <div className="mt-3 space-y-2">
                    <ul className="space-y-1 font-mono text-xs">
                      {qual.steps.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "w-4",
                              s.status === "passed"
                                ? "text-emerald-400"
                                : s.status === "failed"
                                  ? "text-destructive"
                                  : "text-muted-foreground",
                            )}
                          >
                            {s.status === "passed" ? "\u2713" : s.status === "failed" ? "\u2717" : "\u2013"}
                          </span>
                          <span className="w-32">{t(`adminc.engine.qualify.step.${s.id}`)}</span>
                          <span className="text-muted-foreground">
                            {(s.durationMs / 1000).toFixed(1)}s
                            {s.engineVersion ? ` · ${s.engineVersion}` : ""}
                            {s.nps !== null ? ` · ${s.nps} nps` : ""}
                            {s.depth !== null ? ` · d${s.depth}` : ""}
                            {s.score !== null ? ` · ${s.score}` : ""}
                          </span>
                          {s.reason && (
                            <span className={s.status === "skipped" ? "text-muted-foreground" : "text-destructive"}>
                              {s.reason}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        qual.ok ? "text-emerald-400" : "text-amber-400",
                      )}
                    >
                      {qual.ok ? t("adminc.engine.qualify.pass") : t("adminc.engine.qualify.fail")}
                    </p>
                    {!qual.ok && qual.reasons.length > 0 && (
                      <p className="text-xs text-destructive">{qual.reasons.join(" · ")}</p>
                    )}
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {qual.configSignature.slice(0, 16)}… · {(qual.durationMs / 1000).toFixed(1)}s
                    </p>
                  </div>
                )}
              </div>
                  <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{t("adminc.engine.selfplay.title")}</p>
                    <p className="text-xs text-muted-foreground">{t("adminc.engine.selfplay.hint")}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || qualBusy || regressionBusy || !reasonValid || !parsed?.success || !titan}
                    onClick={() => void runRegression()}
                  >
                    <Gauge className="mr-2 h-4 w-4" />
                    {regressionBusy
                      ? t("adminc.engine.selfplay.running")
                      : t("adminc.engine.selfplay.run")}
                  </Button>
                </div>
                {regression && (
                  <div className="mt-3 space-y-2 text-xs">
                    <p className={cn("text-sm font-semibold", regression.ok ? "text-emerald-400" : "text-amber-400")}>
                      {t("adminc.engine.selfplay.score")}: {regression.wins}W / {regression.draws}D / {regression.losses}L
                      {regression.score !== null ? ` · ${(regression.score * 100).toFixed(0)}%` : ""}
                    </p>
                    {!regression.ok && (
                      <p className="text-destructive">{regression.code ?? t("adminc.common.failed")}</p>
                    )}
                    <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
                      {regression.detail.map((g) => (
                        <li key={g.index}>
                          #{g.index + 1} · {g.candidateColor} · {g.result} · {g.plies} plies · {g.termination}
                          {g.error ? ` · ${g.error}` : ""}
                        </li>
                      ))}
                    </ul>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      draft {regression.candidateSignature.slice(0, 12)}… vs v{regression.baselineVersion}{" "}
                      {regression.baselineSignature.slice(0, 12)}… · {regression.moveTimeMs}ms/move ·{" "}
                      {(regression.durationMs / 1000).toFixed(1)}s
                      {regression.engineVersion ? ` · ${regression.engineVersion}` : ""}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {BENCHMARK_KINDS.map((kind) => (
                  <Button
                    key={kind}
                    size="sm"
                    variant="outline"
                    disabled={busy || !reasonValid || !parsed?.success || !titan}
                    onClick={() =>
                      void run(() =>
                        bench({
                          data: {
                            kind,
                            reason: reason.trim(),
                            slug: titan!.slug,
                            // Benchmarks always measure the draft shown here.
                            config: parsed!.data,
                          },
                        }),
                      )
                    }
                  >
                    {t("adminc.engine.runBench")}: {kind}
                  </Button>
                ))}
              </div>
              {!reasonValid && (
                <p className="text-xs text-amber-300">{t("adminc.engine.reasonHint")}</p>
              )}
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
                        <th>Issues</th>
                        <th>At</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {data!.benchmarks.map((b) => (
                        <Fragment key={b.id}>
                          <tr className="border-t border-border/40">
                            <td className="py-2">{b.kind}</td>
                            <td>{b.engineVersion}</td>
                            <td>{b.nps ?? "—"}</td>
                            <td>{b.nodes ?? "—"}</td>
                            <td>{b.depth ?? "—"}</td>
                            <td>{b.score ?? "—"}</td>
                            <td className={b.passed ? "text-emerald-400" : "text-destructive"}>
                              {b.passed
                                ? t("adminc.engine.d.passedYes")
                                : t("adminc.engine.d.passedNo")}
                            </td>
                            <td className="text-destructive">{benchmarkIssues(b) || "—"}</td>
                            <td>{new Date(b.createdAt).toLocaleString()}</td>
                            <td className="text-right">
                              <button
                                type="button"
                                aria-expanded={!!openRows[b.id]}
                                className="rounded px-2 py-1 font-sans text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                onClick={() =>
                                  setOpenRows((prev) => ({ ...prev, [b.id]: !prev[b.id] }))
                                }
                              >
                                {openRows[b.id] ? t("adminc.engine.hide") : t("adminc.engine.details")}
                              </button>
                            </td>
                          </tr>
                          {openRows[b.id] && (
                            <tr className="border-t border-border/20 bg-muted/20">
                              <td colSpan={10} className="p-3">
                                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-sans text-[11px] sm:grid-cols-3 lg:grid-cols-4">
                                  {benchmarkDetailFields(b).map((field) => (
                                    <div key={field.key} className="flex justify-between gap-2">
                                      <dt className="text-muted-foreground">
                                        {t(`adminc.engine.d.${field.key}`)}
                                      </dt>
                                      <dd className={cn("font-mono", field.tone)}>{field.value}</dd>
                                    </div>
                                  ))}
                                </dl>
                              </td>
                            </tr>
                          )}
                        </Fragment>
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
