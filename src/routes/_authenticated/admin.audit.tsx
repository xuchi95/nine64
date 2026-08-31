import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ClipboardList,
  Eye,
  Gamepad2,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Unlock,
  UserRound,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { APP } from "@/config/app";
import { hasRole } from "@/lib/auth.functions";
import { listAdminAuditLog, type AdminAuditRow } from "@/lib/admin.functions";
import { cn } from "@/lib/utils";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { RowSkeleton } from "@/components/layout/RowSkeleton";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({
    meta: [
      { title: `Nhật ký thao tác quản trị — ${APP.name}` },
      {
        name: "description",
        content:
          "Nhật ký mọi thao tác của quản trị viên: xem hồ sơ case, khoá xếp hạng, xoá cảnh báo, mở khoá kèm thời điểm và người thực hiện.",
      },
      { property: "og:title", content: `Nhật ký thao tác quản trị — ${APP.name}` },
      {
        property: "og:description",
        content: "Ai đã làm gì trên bảng điều khiển Fair Play của Nine64, và vào lúc nào.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  pendingComponent: ListSkeleton,
  component: AdminAuditPage,
});

type KindFilter = "all" | "view" | "change";

function useActionMeta() {
  const { t } = useT();
  const map: Record<string, { label: string; change: boolean }> = {
    case_list_view: { label: t("admin.audit.actionCaseListView"), change: false },
    case_view: { label: t("admin.audit.actionCaseView"), change: false },
    metrics_view: { label: t("admin.audit.actionMetricsView"), change: false },
    decision_log_view: { label: t("admin.audit.actionDecisionLogView"), change: false },
    audit_log_view: { label: t("admin.audit.actionAuditLogView"), change: false },
    rating_hold: { label: t("admin.audit.actionRatingHold"), change: true },
    clear_warning: { label: t("admin.audit.actionClearWarning"), change: true },
    unlock: { label: t("admin.audit.actionUnlock"), change: true },
  };
  return useCallback((action: string) => map[action] ?? { label: action, change: true }, [map]);
}

function ActionIcon({ action }: { action: string }) {
  if (action === "rating_hold") return <Lock className="size-4 shrink-0 text-destructive" />;
  if (action === "unlock") return <Unlock className="size-4 shrink-0 text-primary" />;
  if (action === "clear_warning") return <ShieldCheck className="size-4 shrink-0 text-primary" />;
  return <Eye className="size-4 shrink-0 text-muted-foreground" />;
}

function useDetailText() {
  const { t } = useT();
  return useCallback(
    (detail: Record<string, string | number | boolean | null>): string | null => {
      const parts: string[] = [];
      if (typeof detail["hours"] === "number") parts.push(t("admin.audit.detailHours", { hours: detail["hours"] }));
      if (typeof detail["expiresAt"] === "string")
        parts.push(t("admin.audit.detailExpires", { date: new Date(detail["expiresAt"]).toLocaleString("vi-VN") }));
      if (typeof detail["score"] === "number") parts.push(t("admin.audit.detailScore", { score: detail["score"] }));
      if (typeof detail["results"] === "number") parts.push(t("admin.audit.detailResults", { count: detail["results"] }));
      if (typeof detail["cases"] === "number") parts.push(t("admin.audit.detailCases", { count: detail["cases"] }));
      if (typeof detail["kind"] === "string") parts.push(t("admin.audit.detailKind", { kind: detail["kind"] }));
      return parts.length ? parts.join(" · ") : null;
    },
    [t],
  );
}

function AuditItem({ row }: { row: AdminAuditRow }) {
  const { t } = useT();
  const actionMeta = useActionMeta();
  const detailText = useDetailText();
  const info = actionMeta(row.action);
  const extra = detailText(row.detail);
  return (
    <div className="rounded-md border border-border/60 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ActionIcon action={row.action} />
        <span className="text-sm font-medium">{info.label}</span>
        <span
          className={cn(
            "rounded-sm border px-1.5 py-0.5 text-xs",
            info.change ? "border-primary/50 text-primary" : "border-border/60 text-muted-foreground",
          )}
        >
          {info.change ? t("admin.audit.tagChange") : t("admin.audit.tagAccess")}
        </span>
        <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
          {new Date(row.createdAt).toLocaleString("vi-VN")}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <UserRound className="size-3" />
          {t("admin.audit.actorPrefix")} <span className="font-medium text-foreground">{row.actorName}</span>
        </span>
        {row.targetName && (
          <Link to="/admin/fairplay" className="flex items-center gap-1 text-primary hover:underline">
            <UserRound className="size-3" />
            {t("admin.audit.targetPrefix", { name: row.targetName })}
          </Link>
        )}
        {row.targetGameId && (
          <Link
            to="/games/$gameId"
            params={{ gameId: row.targetGameId }}
            className="flex items-center gap-1 font-mono text-muted-foreground hover:underline"
          >
            <Gamepad2 className="size-3" />
            {row.targetGameId.slice(0, 8)}
          </Link>
        )}
      </div>

      {extra && <p className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">{extra}</p>}
      {row.note && <p className="mt-2 text-xs italic text-muted-foreground">{t("admin.audit.notePrefix", { note: row.note })}</p>}
    </div>
  );
}

function AdminAuditPage() {
  const { t } = useT();
  const roleFn = useServerFn(hasRole);
  const listFn = useServerFn(listAdminAuditLog);
  const actionMeta = useActionMeta();

  const [admin, setAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<AdminAuditRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setRows((await listFn({ data: { kind, limit: 300 } })) as AdminAuditRow[]);
    } catch {
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [kind, listFn]);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.actorName.toLowerCase().includes(q) ||
        (r.targetName ?? "").toLowerCase().includes(q) ||
        actionMeta(r.action).label.toLowerCase().includes(q) ||
        (r.targetGameId ?? "").toLowerCase().includes(q),
    );
  }, [query, rows, actionMeta]);

  if (admin === false) {
    return (
      <AdminShell module="audit" title={t("admin.audit.title")}>
        <div className="mx-auto max-w-md py-16 text-center text-muted-foreground">
          {t("admin.adminOnly")}
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell module="audit" title={t("admin.audit.title")}>
      <>
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <ClipboardList className="size-6 text-primary" />
                {t("admin.audit.title")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("admin.audit.subtitle")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link to="/admin/fairplay">{t("admin.audit.casesLink")}</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link to="/admin/fairplay/log">{t("admin.audit.decisionsLink")}</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link to="/admin/security">{t("admin.audit.blockedLink")}</Link>
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void load()}>
                <RefreshCw className={cn("mr-2 size-4", busy && "animate-spin")} />
                {t("admin.audit.refresh")}
              </Button>
            </div>
          </div>

          <Card className="mt-6">
            <CardContent className="flex flex-wrap items-end gap-4 py-4">
              <div className="min-w-[200px] flex-1">
                <label className="text-xs text-muted-foreground" htmlFor="audit-search">
                  {t("admin.audit.searchLabel")}
                </label>
                <div className="relative mt-1">
                  <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="audit-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("admin.audit.searchPlaceholder")}
                    className="h-9 pl-8"
                  />
                </div>
              </div>

              <div>
                <span className="text-xs text-muted-foreground">{t("admin.audit.kindLabel")}</span>
                <div className="mt-1 flex gap-1">
                  {(
                    [
                      ["all", t("admin.audit.kindAll")],
                      ["change", t("admin.audit.kindChange")],
                      ["view", t("admin.audit.kindView")],
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
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("admin.audit.timeline", { count: filtered.length })}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {filtered.length === 0 ? (
                busy ? (
                  <RowSkeleton rows={6} />
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    {t("admin.audit.noMatch")}
                  </p>
                )
              ) : (
                filtered.map((row) => <AuditItem key={row.id} row={row} />)
              )}
            </CardContent>
          </Card>
        </div>
      </>
    </AdminShell>
  );
}
