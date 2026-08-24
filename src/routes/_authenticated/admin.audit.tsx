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
import { AppShell } from "@/components/layout/AppShell";
import { AdminMfaGate } from "@/components/admin/AdminMfaGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { APP } from "@/config/app";
import { hasRole } from "@/lib/auth.functions";
import { listAdminAuditLog, type AdminAuditRow } from "@/lib/admin.functions";
import { cn } from "@/lib/utils";
import { ListSkeleton } from "@/components/layout/PageSkeleton";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({
    meta: [
      { title: `Admin audit log — ${APP.name}` },
      {
        name: "description",
        content:
          "Nhật ký mọi thao tác của quản trị viên: xem hồ sơ case, khoá xếp hạng, xoá cảnh báo, mở khoá kèm thời điểm và người thực hiện.",
      },
      { property: "og:title", content: `Admin audit log — ${APP.name}` },
      {
        property: "og:description",
        content: "Ai đã làm gì trên bảng điều khiển Fair Play của Nexus Chess, và vào lúc nào.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  pendingComponent: ListSkeleton,
  component: AdminAuditPage,
});

type KindFilter = "all" | "view" | "change";

const ACTION_META: Record<string, { label: string; change: boolean }> = {
  case_list_view: { label: "Xem danh sách case", change: false },
  case_view: { label: "Xem hồ sơ case", change: false },
  metrics_view: { label: "Xem số liệu Fair Play", change: false },
  decision_log_view: { label: "Xem nhật ký quyết định", change: false },
  audit_log_view: { label: "Xem nhật ký quản trị", change: false },
  rating_hold: { label: "Khoá xếp hạng", change: true },
  clear_warning: { label: "Xoá cảnh báo", change: true },
  unlock: { label: "Mở khoá xếp hạng", change: true },
};

function meta(action: string) {
  return ACTION_META[action] ?? { label: action, change: true };
}

function ActionIcon({ action }: { action: string }) {
  if (action === "rating_hold") return <Lock className="size-4 shrink-0 text-destructive" />;
  if (action === "unlock") return <Unlock className="size-4 shrink-0 text-primary" />;
  if (action === "clear_warning") return <ShieldCheck className="size-4 shrink-0 text-primary" />;
  return <Eye className="size-4 shrink-0 text-muted-foreground" />;
}

function detailText(detail: Record<string, string | number | boolean | null>): string | null {
  const parts: string[] = [];
  if (typeof detail["hours"] === "number") parts.push(`${detail["hours"]} giờ`);
  if (typeof detail["expiresAt"] === "string")
    parts.push(`hết hạn ${new Date(detail["expiresAt"]).toLocaleString("vi-VN")}`);
  if (typeof detail["score"] === "number") parts.push(`điểm nghi vấn ${detail["score"]}`);
  if (typeof detail["results"] === "number") parts.push(`${detail["results"]} bản ghi`);
  if (typeof detail["cases"] === "number") parts.push(`${detail["cases"]} case`);
  if (typeof detail["kind"] === "string") parts.push(`bộ lọc: ${detail["kind"]}`);
  return parts.length ? parts.join(" · ") : null;
}

function AuditItem({ row }: { row: AdminAuditRow }) {
  const info = meta(row.action);
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
          {info.change ? "Thay đổi" : "Truy cập"}
        </span>
        <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
          {new Date(row.createdAt).toLocaleString("vi-VN")}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <UserRound className="size-3" />
          Thực hiện: <span className="font-medium text-foreground">{row.actorName}</span>
        </span>
        {row.targetName && (
          <Link to="/admin/fairplay" className="flex items-center gap-1 text-primary hover:underline">
            <UserRound className="size-3" />
            Đối tượng: {row.targetName}
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
      {row.note && <p className="mt-2 text-xs italic text-muted-foreground">Lý do: {row.note}</p>}
    </div>
  );
}

function AdminAuditPage() {
  const roleFn = useServerFn(hasRole);
  const listFn = useServerFn(listAdminAuditLog);

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
        meta(r.action).label.toLowerCase().includes(q) ||
        (r.targetGameId ?? "").toLowerCase().includes(q),
    );
  }, [query, rows]);

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
                <ClipboardList className="size-6 text-primary" />
                Nhật ký thao tác quản trị
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Mọi lần xem case, khoá xếp hạng, xoá cảnh báo hay mở khoá — kèm thời điểm và người
                thực hiện.
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link to="/admin/fairplay">Hồ sơ</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link to="/admin/fairplay/log">Quyết định</Link>
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void load()}>
                <RefreshCw className={cn("mr-2 size-4", busy && "animate-spin")} />
                Làm mới
              </Button>
            </div>
          </div>

          <Card className="mt-6">
            <CardContent className="flex flex-wrap items-end gap-4 py-4">
              <div className="min-w-[200px] flex-1">
                <label className="text-xs text-muted-foreground" htmlFor="audit-search">
                  Tìm admin / người chơi / thao tác
                </label>
                <div className="relative mt-1">
                  <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="audit-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Tên, thao tác hoặc mã ván"
                    className="h-9 pl-8"
                  />
                </div>
              </div>

              <div>
                <span className="text-xs text-muted-foreground">Loại thao tác</span>
                <div className="mt-1 flex gap-1">
                  {(
                    [
                      ["all", "Tất cả"],
                      ["change", "Thay đổi"],
                      ["view", "Truy cập"],
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
              <CardTitle className="text-base">Dòng thời gian ({filtered.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {filtered.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {busy ? "Đang tải nhật ký…" : "Chưa có thao tác nào khớp bộ lọc."}
                </p>
              ) : (
                filtered.map((row) => <AuditItem key={row.id} row={row} />)
              )}
            </CardContent>
          </Card>
        </div>
      </AdminMfaGate>
    </AppShell>
  );
}
