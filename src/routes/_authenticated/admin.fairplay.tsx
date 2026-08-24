import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, ShieldCheck, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP } from "@/config/app";
import { hasRole } from "@/lib/auth.functions";
import { getFairplayCase, listFairplayCases, resolveFairplayCase } from "@/lib/fairplay.functions";
import { ACTION_LABEL, THRESHOLDS, type FairplayAction } from "@/lib/fairplay/thresholds";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/fairplay")({
  head: () => ({
    meta: [
      { title: `Fair play cases — ${APP.name}` },
      { name: "description", content: "Xem xét hồ sơ fair play và bằng chứng thuật toán." },
      { property: "og:title", content: `Fair play cases — ${APP.name}` },
      { property: "og:description", content: "Bảng điều khiển fair play cho quản trị viên." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
  const roleFn = useServerFn(hasRole);
  const listFn = useServerFn(listFairplayCases);
  const caseFn = useServerFn(getFairplayCase);
  const resolveFn = useServerFn(resolveFairplayCase);

  const [admin, setAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setRows((await listFn()) as CaseRow[]);
    } catch {
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [listFn]);

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
    async (userId: string, decision: "clear" | "rating_hold") => {
      await resolveFn({ data: { userId, decision } });
      await load();
    },
    [load, resolveFn],
  );

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
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Fair play</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Hồ sơ được xếp theo điểm nghi vấn tổng hợp. Hành động tự động chỉ giới hạn xếp hạng,
              không khoá tài khoản.
            </p>
          </div>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void load()}>
            <RefreshCw className={cn("mr-2 size-4", busy && "animate-spin")} />
            Làm mới
          </Button>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_380px]">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Hồ sơ ({rows.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {rows.length === 0 && (
                <p className="text-sm text-muted-foreground">Chưa có hồ sơ nào.</p>
              )}
              {rows.map((row) => (
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
                      {ACTION_LABEL[isAction(row.action) ? row.action : "none"]} · SPRT{" "}
                      {row.sprt_decision} · {row.games_reviewed} ván
                      {row.boosting_score >= 60 ? " · dàn xếp" : ""}
                      {row.sandbagging_score >= 60 ? " · cố thua" : ""}
                    </span>
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
              <CardTitle className="text-base">Bằng chứng</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {!selected && <p className="text-muted-foreground">Chọn một hồ sơ để xem chi tiết.</p>}
              {selected && detail && (
                <>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => void resolve(selected, "clear")}>
                      Xoá cảnh báo
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void resolve(selected, "rating_hold")}
                    >
                      Khoá xếp hạng
                    </Button>
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
                      <p className="text-muted-foreground">Chưa có báo cáo ván nào.</p>
                    )}
                  </div>

                  {detail.actions.length > 0 && (
                    <div>
                      <p className="mb-1 font-medium">Lịch sử xử lý</p>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {detail.actions.map((a) => (
                          <li key={a.id}>
                            {new Date(a.created_at).toLocaleString("vi-VN")} · {a.action} ·{" "}
                            {a.automatic ? "tự động" : "quản trị viên"}
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
    </AppShell>
  );
}
