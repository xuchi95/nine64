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
import { AdminMfaGate } from "@/components/admin/AdminMfaGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { APP } from "@/config/app";
import { hasRole } from "@/lib/auth.functions";
import { listFairplayDecisions } from "@/lib/fairplay.functions";
import { ACTION_LABEL, THRESHOLDS, type FairplayAction } from "@/lib/fairplay/thresholds";
import { cn } from "@/lib/utils";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { RowSkeleton } from "@/components/layout/RowSkeleton";

export const Route = createFileRoute("/_authenticated/admin/fairplay/log")({
  head: () => ({
    meta: [
      { title: `Fair play decision log — ${APP.name}` },
      {
        name: "description",
        content: "Toàn bộ quyết định Fair Play theo ván và theo người chơi kèm thời điểm, mức tin cậy và lý do.",
      },
      { property: "og:title", content: `Fair play decision log — ${APP.name}` },
      { property: "og:description", content: "Nhật ký kiểm tra mọi quyết định Fair Play của Nexus Chess." },
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

function actionLabel(row: DecisionRow): string {
  if (isAction(row.action)) return ACTION_LABEL[row.action];
  if (row.action === "cleared") return "Admin xoá cảnh báo";
  if (row.action === "unlocked") return "Admin mở khoá xếp hạng";
  return row.action;
}

function tone(score: number) {
  if (score >= THRESHOLDS.hold) return "text-destructive";
  if (score >= THRESHOLDS.monitor) return "text-warning";
  return "text-muted-foreground";
}

function confidenceLabel(value: number): string {
  const pct = Math.round((value > 1 ? value / 100 : value) * 100);
  if (pct >= 85) return `Rất cao (${pct}%)`;
  if (pct >= 65) return `Cao (${pct}%)`;
  if (pct >= 40) return `Trung bình (${pct}%)`;
  return `Thấp (${pct}%)`;
}

function DecisionItem({ row }: { row: DecisionRow }) {
  const flagged = row.score >= THRESHOLDS.monitor;
  return (
    <div className="rounded-md border border-border/60 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {flagged ? (
          <ShieldAlert className="size-4 shrink-0 text-destructive" />
        ) : (
          <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">{actionLabel(row)}</span>
        <span
          className={cn(
            "rounded-sm border border-border/60 px-1.5 py-0.5 text-xs",
            row.automatic ? "text-muted-foreground" : "border-primary/50 text-primary",
          )}
        >
          {row.kind === "verdict" ? "Thuật toán" : row.automatic ? "Tự động" : "Quản trị viên"}
        </span>
        <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
          {new Date(row.createdAt).toLocaleString("vi-VN")}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs tabular-nums text-muted-foreground">
        <span>
          Điểm nghi vấn <span className={cn("font-semibold", tone(row.score))}>{row.score}</span>
        </span>
        {row.kind === "verdict" && <span>Tin cậy {confidenceLabel(row.confidence)}</span>}
        {row.kind === "verdict" && row.evalMs > 0 && <span>Xử lý {row.evalMs} ms</span>}
        {row.rating !== null && <span>Rating {row.rating}</span>}
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
      {row.note && <p className="mt-2 text-xs italic text-muted-foreground">Ghi chú: {row.note}</p>}
    </div>
  );
}

function FairplayLogPage() {
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
            ? `Ván ${row.gameId.slice(0, 8)}`
            : "Không gắn ván";
      const bucket = map.get(key) ?? { key, label, rows: [] };
      bucket.rows.push(row);
      map.set(key, bucket);
    }
    return [...map.values()].sort((a, b) => b.rows.length - a.rows.length);
  }, [filtered, group]);

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
              <ScrollText className="size-6 text-primary" />
              Nhật ký Fair Play
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Mọi quyết định của thuật toán và của quản trị viên, kèm thời điểm, mức tin cậy và lý do
              tổng quát.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link to="/admin/fairplay">Hồ sơ</Link>
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
              <label className="text-xs text-muted-foreground" htmlFor="fp-search">
                Tìm người chơi / mã ván
              </label>
              <div className="relative mt-1">
                <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="fp-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tên hoặc id ván"
                  className="h-9 pl-8"
                />
              </div>
            </div>

            <div>
              <span className="text-xs text-muted-foreground">Nhóm theo</span>
              <div className="mt-1 flex gap-1">
                {(
                  [
                    ["time", "Thời gian"],
                    ["player", "Người chơi"],
                    ["game", "Ván"],
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
              <span className="text-xs text-muted-foreground">Loại</span>
              <div className="mt-1 flex gap-1">
                {(
                  [
                    ["all", "Tất cả"],
                    ["verdict", "Thuật toán"],
                    ["action", "Xử lý"],
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
                Điểm tối thiểu
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
                Chưa có quyết định nào khớp bộ lọc.
              </p>
            ))}

          {groups.map((bucket) =>
            group === "time" ? (
              <Card key={bucket.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Dòng thời gian ({filtered.length})</CardTitle>
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
                      {bucket.rows.length} quyết định
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
    </AdminMfaGate>
    </AppShell>
  );
}
