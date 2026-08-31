import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Brain, History, RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import {
  getAiPromptVersions,
  getIntelligenceOverview,
  publishAiPrompt,
  rollbackAiPrompt,
  saveAiPromptDraft,
  type IntelligenceOverview,
} from "@/lib/adminIntelligence.functions";
import { PROMPT_KEYS, type PromptKey } from "@/lib/intelligence/promptTypes";

export const Route = createFileRoute("/_authenticated/admin/intelligence")({
  head: () => ({
    meta: [
      { title: `Trí tuệ AI · ${APP.name}` },
      {
        name: "description",
        content: "Quản trị prompt AI Coach, model được phép, hạn mức và số liệu sử dụng của Nine64.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Trí tuệ AI · ${APP.name}` },
      {
        property: "og:description",
        content: "Prompt AI Coach có phiên bản, model allowlist và số liệu sử dụng.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminIntelligencePage,
});

function AdminIntelligencePage() {
  const { t } = useT();
  const load = useServerFn(getIntelligenceOverview);
  const saveDraft = useServerFn(saveAiPromptDraft);
  const publish = useServerFn(publishAiPrompt);
  const rollback = useServerFn(rollbackAiPrompt);
  const versionsFn = useServerFn(getAiPromptVersions);

  const [data, setData] = useState<IntelligenceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeKey, setActiveKey] = useState<PromptKey>(PROMPT_KEYS[0]);
  const [body, setBody] = useState("");
  const [model, setModel] = useState<string>("");
  const [reason, setReason] = useState("");
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof getAiPromptVersions>>>([]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const next = await load();
      setData(next);
      const row = next.prompts.find((p) => p.key === activeKey);
      if (row) {
        setBody(row.hasDraft ? row.draftBody : row.body);
        setModel(row.model);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    }
  }, [load, activeKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const current = data?.prompts.find((p) => p.key === activeKey) ?? null;
  const reasonValid = reason.trim().length >= 10;
  const bodyValid = body.trim().length >= 40;

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

  return (
    <AdminShell module="intelligence" title={t("adminc.intel.title")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("adminc.intel.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("adminc.intel.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw className="mr-2 h-4 w-4" /> {t("adminc.common.refresh")}
        </Button>
      </div>

      <p className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        {t("adminc.intel.secretNote")}
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

      <Tabs defaultValue="prompts" className="mt-6">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="prompts">{t("adminc.intel.tab.prompts")}</TabsTrigger>
          <TabsTrigger value="settings">{t("adminc.intel.tab.settings")}</TabsTrigger>
          <TabsTrigger value="metrics">{t("adminc.intel.tab.metrics")}</TabsTrigger>
          <TabsTrigger value="versions">{t("adminc.intel.tab.versions")}</TabsTrigger>
        </TabsList>

        <TabsContent value="prompts" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {PROMPT_KEYS.map((key) => (
              <Button
                key={key}
                size="sm"
                variant={key === activeKey ? "default" : "outline"}
                onClick={() => setActiveKey(key)}
              >
                {key}
              </Button>
            ))}
          </div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Brain className="h-4 w-4" /> {activeKey} · v{current?.version ?? 0}
                {current?.hasDraft ? " · draft" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">{t("adminc.intel.model")}</span>
                <select
                  className="w-full rounded-md border border-input bg-background p-2 text-sm"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {(data?.models ?? []).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">{t("adminc.intel.body")}</span>
                <Textarea rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
              </label>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("adminc.intel.reason")}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !bodyValid || !model}
                  onClick={() => void run(() => saveDraft({ data: { key: activeKey, body, model } }))}
                >
                  {t("adminc.intel.saveDraft")}
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !bodyValid || !model || !reasonValid}
                  onClick={() =>
                    void run(() =>
                      publish({
                        data: {
                          key: activeKey,
                          body,
                          model,
                          reason: reason.trim(),
                          expectedVersion: current?.version ?? null,
                        },
                      }),
                    )
                  }
                >
                  {t("adminc.intel.publish")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <ul className="space-y-2 text-xs">
                {(data?.settings ?? []).map((s) => (
                  <li key={s.key} className="flex items-center justify-between border-b border-border/40 py-2">
                    <span className="font-mono">{s.key}</span>
                    <span className="font-mono text-muted-foreground">{JSON.stringify(s.value)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                /admin/system → {t("adminc.intel.tab.settings")}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4" /> {t("adminc.intel.tab.metrics")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {!data?.metrics.available ? (
                <p className="text-muted-foreground">{t("adminc.intel.noMetrics")}</p>
              ) : (
                <ul className="grid gap-2 font-mono text-xs sm:grid-cols-2">
                  <li>requests: {data.metrics.requests ?? "—"}</li>
                  <li>failures: {data.metrics.failures ?? "—"}</li>
                  <li>rateLimited: {data.metrics.rateLimited ?? "—"}</li>
                  <li>paymentRequired: {data.metrics.paymentRequired ?? "—"}</li>
                  <li>avgLatencyMs: {data.metrics.avgLatencyMs ?? "—"}</li>
                  <li>window: {data.metrics.windowHours}h</li>
                </ul>
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
                disabled={busy}
                onClick={async () => setVersions(await versionsFn({ data: { key: activeKey } }))}
              >
                <History className="mr-2 h-4 w-4" /> {t("adminc.common.refresh")}
              </Button>
              {versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {versions.map((v) => (
                    <li key={v.version} className="rounded border border-border/40 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono">
                          v{v.version} · {v.model} · {new Date(v.createdAt).toLocaleString()}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy || !reasonValid}
                          onClick={() =>
                            void run(() =>
                              rollback({
                                data: {
                                  key: activeKey,
                                  toVersion: v.version,
                                  reason: reason.trim(),
                                  expectedVersion: current?.version ?? null,
                                },
                              }),
                            )
                          }
                        >
                          {t("adminc.intel.rollback")}
                        </Button>
                      </div>
                      <p className="mt-1 text-muted-foreground">{v.reason}</p>
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
