import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, ShieldCheck, RefreshCw, LockOpen, Clock, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP } from "@/config/app";
import { hasRole } from "@/lib/auth.functions";
import {
  getFairplayCase,
  getFairplayMetrics,
  listFairplayCases,
  resolveFairplayCase,
} from "@/lib/fairplay.functions";
import { FairplayMetricsPanel } from "@/components/fairplay/FairplayMetricsPanel";
import { formatRemaining, isLockActive, remainingLockMs } from "@/lib/fairplay/lockPolicy";
import type { FairplayMetrics } from "@/lib/fairplay/metrics";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminMfaGate } from "@/components/admin/AdminMfaGate";
import { actionLabel, THRESHOLDS, type FairplayAction } from "@/lib/fairplay/thresholds";
import { cn } from "@/lib/utils";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/fairplay")({
  head: () => ({
    meta: [
      { title: `Hồ sơ Fair Play — ${APP.name}` },
      { name: "description", content: "Xem xét hồ sơ fair play và bằng chứng thuật toán." },
      { property: "og:title", content: `Hồ sơ Fair Play — ${APP.name}` },
      { property: "og:description", content: "Bảng điều khiển fair play cho quản trị viên." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  pendingComponent: ListSkeleton,
  component: AdminFairplayPage,
});

interface CaseRow {
  user_id: string;
  displayName: string;
  rating: number | null;
  score: number;
  action: string;
  sprt_decision: string;
  sprt_llr: number;
  boosting_score: number;
  sandbagging_score: number;
  rating_locked: boolean;
  lock_started_at: string | null;
  lock_expires_at: string | null;
  lock_hours: number;
  games_reviewed: number;
  reasons: unknown;
  updated_at: string;
}

interface CaseDetail {
  reports: {
    game_id: string;
    score: number;
    confidence: number;
    action: string;
    reasons: unknown;
    contributions: unknown;
    created_at: string;
  }[];
  actions: { id: string; action: string; score: number; automatic: boolean; note: string | null; created_at: string }[];
}

function tone(score: number) {
  if (score >= THRESHOLDS.hold) return "text-destructive";
  if (score >= THRESHOLDS.unrated) return "text-warning";
  if (score >= THRESHOLDS.monitor) return "text-warning";
  return "text-muted-foreground";
}

function isAction(value: string): value is FairplayAction {
  return value === "none" || value === "monitor" || value === "unrated" || value === "rating_hold";
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function AdminFairplayPage() {
  const { t } = useT();
  const roleFn = useServerFn(hasRole);
  const listFn = useServerFn(listFairplayCases);
  const caseFn = useServerFn(getFairplayCase);
  const resolveFn = useServerFn(resolveFairplayCase);
  const metricsFn = useServerFn(getFairplayMetrics);

  const [admin, setAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState<FairplayMetrics | null>(null);
  const [lockHours, setLockHours] = useState(72);
  const [lockNote, setLockNote] = useState("");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<"24h" | "7d" | "30d" | "all">("all");
  const [risk, setRisk] = useState<"all" | "high" | "medium" | "low">("all");
  const [status, setStatus] = useState<"all" | "locked" | "flagged" | "clear">("all");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [list, stats] = await Promise.all([listFn(), metricsFn()]);
      setRows(list as CaseRow[]);
      setMetrics(stats as FairplayMetrics);
    } catch {
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [listFn, metricsFn]);

  useEffect(() => {
    void (async () => {
      try {
        const ok = (await roleFn({ data: { role: "admin" } })) as boolean;
        setAdmin(ok);
        if (ok) await load();
      } catch {
        setAdmin(false);
      }
    })();
  }, [load, roleFn]);

  useEffect(() => {
    if (!selected) return;
    void (async () => {
      try {
        setDetail((await caseFn({ data: { userId: selected } })) as CaseDetail);
      } catch {
        setDetail(null);
      }
    })();
  }, [caseFn, selected]);

  const resolve = useCallback(
    async (userId: string, decision: "clear" | "rating_hold" | "unlock") => {
      const note = lockNote.trim();
      await resolveFn({
        data: { userId, decision, hours: lockHours, ...(note ? { note } : {}) },
      });
      setLockNote("");
      await load();
      setDetail((await caseFn({ data: { userId } })) as CaseDetail);
    },
    [caseFn, load, lockHours, lockNote, resolveFn],
  );

  const selectedRow = rows.find((r) => r.user_id === selected) ?? null;

  const rangeMs =
    range === "24h" ? 86_400_000 : range === "7d" ? 604_800_000 : range === "30d" ? 2_592_000_000 : null;
  const needle = query.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (needle && !`${row.displayName} ${row.user_id}`.toLowerCase().includes(needle)) return false;
    if (rangeMs && Date.now() - new Date(row.updated_at).getTime() > rangeMs) return false;
    if (risk === "high" && row.score < THRESHOLDS.hold) return false;
    if (risk === "medium" && (row.score >= THRESHOLDS.hold || row.score < THRESHOLDS.unrated)) return false;
    if (risk === "low" && row.score >= THRESHOLDS.unrated) return false;
    if (status === "locked" && !isLockActive(row)) return false;
    if (status === "flagged" && (isLockActive(row) || row.action === "none")) return false;
    if (status === "clear" && (isLockActive(row) || row.action !== "none")) return false;
    return true;
  });

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
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("admin.fairplay.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("admin.fairplay.subtitle")}
            </p>
          </div>
          <div className="flex gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link to="/admin/fairplay/log">{t("admin.fairplay.decisionLog")}</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/admin/audit">{t("admin.fairplay.adminAuditLog")}</Link>
          </Button>

          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void load()}>
            <RefreshCw className={cn("mr-2 size-4", busy && "animate-spin")} />
            {t("admin.fairplay.refresh")}
          </Button>
          </div>
        </div>

        {metrics && (
          <div className="mt-6">
            <FairplayMetricsPanel metrics={metrics} />
          </div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_380px]">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t("admin.fairplay.casesTitle", { filtered: filtered.length, total: rows.length })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative sm:col-span-2 lg:col-span-1">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("admin.fairplay.searchPlaceholder")}
                    className="h-9 pl-8"
                  />
                </div>
                <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t("admin.fairplay.timePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">{t("admin.fairplay.time24h")}</SelectItem>
                    <SelectItem value="7d">{t("admin.fairplay.time7d")}</SelectItem>
                    <SelectItem value="30d">{t("admin.fairplay.time30d")}</SelectItem>
                    <SelectItem value="all">{t("admin.fairplay.timeAll")}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={risk} onValueChange={(v) => setRisk(v as typeof risk)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t("admin.fairplay.riskPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("admin.fairplay.riskAll")}</SelectItem>
                    <SelectItem value="high">{t("admin.fairplay.riskHigh", { hold: THRESHOLDS.hold })}</SelectItem>
                    <SelectItem value="medium">
                      {t("admin.fairplay.riskMedium", { unrated: THRESHOLDS.unrated, maxMedium: THRESHOLDS.hold - 1 })}
                    </SelectItem>
                    <SelectItem value="low">{t("admin.fairplay.riskLow", { unrated: THRESHOLDS.unrated })}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t("admin.fairplay.statusPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("admin.fairplay.statusAll")}</SelectItem>
                    <SelectItem value="locked">{t("admin.fairplay.statusLocked")}</SelectItem>
                    <SelectItem value="flagged">{t("admin.fairplay.statusFlagged")}</SelectItem>
                    <SelectItem value="clear">{t("admin.fairplay.statusClear")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("admin.fairplay.noMatch")}</p>
              )}
              {filtered.map((row) => (
                <button
                  key={row.user_id}
                  type="button"
                  onClick={() => setSelected(row.user_id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border border-border/60 p-3 text-left transition hover:border-primary/50",
                    selected === row.user_id && "border-primary bg-muted/40",
                  )}
                >
                  {row.rating_locked ? (
                    <ShieldAlert className="size-4 shrink-0 text-destructive" />
                  ) : (
                    <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{row.displayName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t("admin.fairplay.rowSummary", {
                        action: actionLabel(isAction(row.action) ? row.action : "none"),
                        sprt: row.sprt_decision,
                        games: row.games_reviewed,
                      })}
                      {row.boosting_score >= 60 ? t("admin.fairplay.boostingSuffix") : ""}
                      {row.sandbagging_score >= 60 ? t("admin.fairplay.sandbaggingSuffix") : ""}
                    </span>
                    {isLockActive(row) && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                        <Clock className="size-3" />
                        {t("admin.fairplay.lockRemaining", {
                          remaining: formatRemaining(remainingLockMs(row.lock_expires_at)),
                        })}
                      </span>
                    )}
                  </span>
                  <span className={cn("font-mono text-lg font-semibold", tone(row.score))}>
                    {row.score}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("admin.fairplay.evidenceTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {!selected && <p className="text-muted-foreground">{t("admin.fairplay.selectCase")}</p>}
              {selected && detail && (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground" htmlFor="lock-hours">
                        {t("admin.fairplay.lockHoursLabel")}
                      </label>
                      <Input
                        id="lock-hours"
                        type="number"
                        min={1}
                        max={720}
                        value={lockHours}
                        onChange={(e) => setLockHours(Number(e.target.value) || 1)}
                        className="h-9 w-24 font-mono tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground" htmlFor="lock-note">
                        {t("admin.fairplay.reasonLabel")}
                      </label>
                      <Textarea
                        id="lock-note"
                        rows={2}
                        maxLength={500}
                        value={lockNote}
                        onChange={(e) => setLockNote(e.target.value)}
                        placeholder={t("admin.fairplay.reasonPlaceholder")}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => void resolve(selected, "clear")}>
                        {t("admin.fairplay.clearWarning")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void resolve(selected, "rating_hold")}
                      >
                        {t("admin.fairplay.lockFor", { hours: lockHours })}
                      </Button>
                      {selectedRow && isLockActive(selectedRow) && (
                        <Button size="sm" onClick={() => void resolve(selected, "unlock")}>
                          <LockOpen className="mr-2 size-4" />
                          {t("admin.fairplay.unlock")}
                        </Button>
                      )}
                    </div>
                    {selectedRow && isLockActive(selectedRow) && (
                      <p className="text-xs text-muted-foreground">
                        {t("admin.fairplay.autoExpireNotice", {
                          remaining: formatRemaining(remainingLockMs(selectedRow.lock_expires_at)),
                          hours: selectedRow.lock_hours
                            ? t("admin.fairplay.autoExpireHoursSuffix", { hours: selectedRow.lock_hours })
                            : "",
                        })}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    {detail.reports.map((r) => (
                      <div key={r.game_id} className="rounded-md border border-border/60 p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs text-muted-foreground">
                            {new Date(r.created_at).toLocaleString("vi-VN")}
                          </span>
                          <span className={cn("font-mono font-semibold", tone(r.score))}>
                            {r.score}
                          </span>
                        </div>
                        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                          {asStrings(r.reasons).map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {detail.reports.length === 0 && (
                      <p className="text-muted-foreground">{t("admin.fairplay.noReports")}</p>
                    )}
                  </div>

                  {detail.actions.length > 0 && (
                    <div>
                      <p className="mb-1 font-medium">{t("admin.fairplay.actionHistory")}</p>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {detail.actions.map((a) => (
                          <li key={a.id} className="rounded border border-border/50 p-2">
                            <span className="block">
                              {t("admin.fairplay.historyLine", {
                                time: new Date(a.created_at).toLocaleString("vi-VN"),
                                action: a.action,
                                actor: a.automatic ? t("admin.fairplay.automatic") : t("admin.fairplay.byAdmin"),
                              })}
                            </span>
                            {a.note && (
                              <span className="mt-1 block text-foreground">
                                {t("admin.fairplay.reasonPrefix", { note: a.note })}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      </AdminMfaGate>
    </AppShell>
  );
}
