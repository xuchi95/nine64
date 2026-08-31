import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  RefreshCw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Gamepad2,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { APP } from "@/config/app";
import { hasRole } from "@/lib/auth.functions";
import { listFairplayDecisions } from "@/lib/fairplay.functions";
import { actionLabel as actionLabelFor, THRESHOLDS, type FairplayAction } from "@/lib/fairplay/thresholds";
import { cn } from "@/lib/utils";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { RowSkeleton } from "@/components/layout/RowSkeleton";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/fairplay/log")({
  head: () => ({
    meta: [
      { title: `Nhật ký quyết định Fair Play — ${APP.name}` },
      {
        name: "description",
        content: "Toàn bộ quyết định Fair Play theo ván và theo người chơi kèm thời điểm, mức tin cậy và lý do.",
      },
      { property: "og:title", content: `Nhật ký quyết định Fair Play — ${APP.name}` },
      { property: "og:description", content: "Nhật ký kiểm tra mọi quyết định Fair Play của Nine64." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  pendingComponent: ListSkeleton,
  component: FairplayLogPage,
});

interface DecisionRow {
  id: string;
  kind: "verdict" | "action";
  createdAt: string;
  userId: string;
  displayName: string;
  rating: number | null;
  gameId: string | null;
  action: string;
  score: number;
  confidence: number;
  probability: number;
  automatic: boolean;
  evalMs: number;
  reasons: string[];
  note: string | null;
}

type GroupMode = "time" | "player" | "game";
type KindFilter = "all" | "verdict" | "action";

function isAction(value: string): value is FairplayAction {
  return value === "none" || value === "monitor" || value === "unrated" || value === "rating_hold";
}

function useActionLabel() {
  const { t } = useT();
  return useCallback(
    (row: DecisionRow): string => {
      if (isAction(row.action)) return actionLabelFor(row.action);
      if (row.action === "cleared") return t("admin.log.adminClearedWarning");
      if (row.action === "unlocked") return t("admin.log.adminUnlockedRating");
      return row.action;
    },
    [t],
  );
}

function tone(score: number) {
  if (score >= THRESHOLDS.hold) return "text-destructive";
  if (score >= THRESHOLDS.monitor) return "text-warning";
  return "text-muted-foreground";
}

function useConfidenceLabel() {
  const { t } = useT();
  return useCallback(
    (value: number): string => {
      const pct = Math.round((value > 1 ? value / 100 : value) * 100);
      if (pct >= 85) return t("admin.log.confidenceVeryHigh", { pct });
      if (pct >= 65) return t("admin.log.confidenceHigh", { pct });
      if (pct >= 40) return t("admin.log.confidenceMedium", { pct });
      return t("admin.log.confidenceLow", { pct });
    },
    [t],
  );
}

function DecisionItem({ row }: { row: DecisionRow }) {
  const { t } = useT();
  const getActionLabel = useActionLabel();
  const confidenceLabel = useConfidenceLabel();
  const flagged = row.score >= THRESHOLDS.monitor;
  return (
    <div className="rounded-md border border-border/60 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {flagged ? (
          <ShieldAlert className="size-4 shrink-0 text-destructive" />
        ) : (
          <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">{getActionLabel(row)}</span>
        <span
          className={cn(
            "rounded-sm border border-border/60 px-1.5 py-0.5 text-xs",
            row.automatic ? "text-muted-foreground" : "border-primary/50 text-primary",
          )}
        >
          {row.kind === "verdict"
            ? t("admin.log.tagAlgorithm")
            : row.automatic
              ? t("admin.log.tagAutomatic")
              : t("admin.log.tagAdmin")}
        </span>
        <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
          {new Date(row.createdAt).toLocaleString("vi-VN")}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs tabular-nums text-muted-foreground">
        <span className={cn(tone(row.score))}>
          {t("admin.log.scoreLabel", { score: row.score })}
        </span>
        {row.kind === "verdict" && <span>{t("admin.log.confidenceLabel", { confidence: confidenceLabel(row.confidence) })}</span>}
        {row.kind === "verdict" && row.evalMs > 0 && <span>{t("admin.log.processedMs", { ms: row.evalMs })}</span>}
        {row.rating !== null && <span>{t("admin.log.ratingLabel", { rating: row.rating })}</span>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <Link
          to="/admin/fairplay"
          className="flex items-center gap-1 text-primary hover:underline"
        >
          <UserRound className="size-3" />
          {row.displayName}
        </Link>
        {row.gameId && (
          <Link
            to="/games/$gameId"
            params={{ gameId: row.gameId }}
            className="flex items-center gap-1 font-mono text-muted-foreground hover:underline"
          >
            <Gamepad2 className="size-3" />
            {row.gameId.slice(0, 8)}
          </Link>
        )}
      </div>

      {row.reasons.length > 0 && (
        <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
          {row.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {row.note && <p className="mt-2 text-xs italic text-muted-foreground">{t("admin.log.noteLabel", { note: row.note })}</p>}
    </div>
  );
}

function FairplayLogPage() {
  const { t } = useT();
  const roleFn = useServerFn(hasRole);
  const listFn = useServerFn(listFairplayDecisions);

  const [admin, setAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<DecisionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<KindFilter>("all");
  const [minScore, setMinScore] = useState(0);
  const [group, setGroup] = useState<GroupMode>("time");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setRows((await listFn({ data: { kind, minScore, limit: 300 } })) as DecisionRow[]);
    } catch {
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [kind, listFn, minScore]);

  useEffect(() => {
    void (async () => {
      try {
        const ok = (await roleFn({ data: { role: "admin" } })) as boolean;
        setAdmin(ok);
      } catch {
        setAdmin(false);
      }
    })();
  }, [roleFn]);

  useEffect(() => {
    if (admin) void load();
  }, [admin, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        (r.gameId ?? "").toLowerCase().includes(q) ||
        r.userId.toLowerCase().includes(q),
    );
  }, [query, rows]);

  const groups = useMemo(() => {
    if (group === "time") return [{ key: "all", label: "", rows: filtered }];
    const map = new Map<string, { key: string; label: string; rows: DecisionRow[] }>();
    for (const row of filtered) {
      const key = group === "player" ? row.userId : (row.gameId ?? "no-game");
      const label =
        group === "player"
          ? `${row.displayName}`
          : row.gameId
            ? t("admin.log.gamePrefix", { id: row.gameId.slice(0, 8) })
            : t("admin.log.noGame");
      const bucket = map.get(key) ?? { key, label, rows: [] };
      bucket.rows.push(row);
      map.set(key, bucket);
    }
    return [...map.values()].sort((a, b) => b.rows.length - a.rows.length);
  }, [filtered, group, t]);

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
    <AdminShell module="fairplayLog" title={t("admin.log.title")}>
      <>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <ScrollText className="size-6 text-primary" />
              {t("admin.log.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("admin.log.subtitle")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link to="/admin/fairplay">{t("admin.log.casesLink")}</Link>
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void load()}>
              <RefreshCw className={cn("mr-2 size-4", busy && "animate-spin")} />
              {t("admin.fairplay.refresh")}
            </Button>
          </div>
        </div>

        <Card className="mt-6">
          <CardContent className="flex flex-wrap items-end gap-4 py-4">
            <div className="min-w-[200px] flex-1">
              <label className="text-xs text-muted-foreground" htmlFor="fp-search">
                {t("admin.log.searchLabel")}
              </label>
              <div className="relative mt-1">
                <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="fp-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("admin.log.searchPlaceholder")}
                  className="h-9 pl-8"
                />
              </div>
            </div>

            <div>
              <span className="text-xs text-muted-foreground">{t("admin.log.groupBy")}</span>
              <div className="mt-1 flex gap-1">
                {(
                  [
                    ["time", t("admin.log.groupTime")],
                    ["player", t("admin.log.groupPlayer")],
                    ["game", t("admin.log.groupGame")],
                  ] as [GroupMode, string][]
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={group === value ? "default" : "secondary"}
                    onClick={() => setGroup(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-xs text-muted-foreground">{t("admin.log.kindLabel")}</span>
              <div className="mt-1 flex gap-1">
                {(
                  [
                    ["all", t("admin.log.kindAll")],
                    ["verdict", t("admin.log.kindAlgorithm")],
                    ["action", t("admin.log.kindAction")],
                  ] as [KindFilter, string][]
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={kind === value ? "default" : "secondary"}
                    onClick={() => setKind(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground" htmlFor="fp-min">
                {t("admin.log.minScoreLabel")}
              </label>
              <Input
                id="fp-min"
                type="number"
                min={0}
                max={100}
                value={minScore}
                onChange={(e) =>
                  setMinScore(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
                }
                className="mt-1 h-9 w-24 font-mono tabular-nums"
              />
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 space-y-4">
          {filtered.length === 0 &&
            (busy ? (
              <RowSkeleton rows={6} />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t("admin.log.noMatch")}
              </p>
            ))}

          {groups.map((bucket) =>
            group === "time" ? (
              <Card key={bucket.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t("admin.log.timeline", { count: filtered.length })}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {bucket.rows.map((row) => (
                    <DecisionItem key={row.id} row={row} />
                  ))}
                </CardContent>
              </Card>
            ) : (
              <Card key={bucket.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {group === "player" ? (
                      <UserRound className="size-4 text-primary" />
                    ) : (
                      <Gamepad2 className="size-4 text-primary" />
                    )}
                    {bucket.label}
                    <span className="ml-auto font-mono text-xs font-normal text-muted-foreground tabular-nums">
                      {t("admin.log.decisionsCount", { count: bucket.rows.length })}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {bucket.rows.map((row) => (
                    <DecisionItem key={row.id} row={row} />
                  ))}
                </CardContent>
              </Card>
            ),
          )}
        </div>
      </div>
    </>
    </AdminShell>
  );
}
