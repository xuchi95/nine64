import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, RefreshCw, Trash2, Zap } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { APP } from "@/config/app";
import {
  adminOpeningsOverview,
  adminResetExplorerBreaker,
  adminRunOpeningImport,
  adminSaveOpeningDataset,
} from "@/lib/openings/adminOpenings.functions";

export const Route = createFileRoute("/_authenticated/admin/openings")({
  head: () => ({
    meta: [
      { title: `Khai cuộc · ${APP.name}` },
      {
        name: "description",
        content:
          "Quản trị dataset khai cuộc Nine64: phiên bản ECO, import job và số liệu cache của Opening Explorer.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Khai cuộc · ${APP.name}` },
      { property: "og:description", content: "Công cụ nội bộ quản lý dữ liệu khai cuộc." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOpeningsPage,
});

type Overview = Awaited<ReturnType<typeof adminOpeningsOverview>>;

function AdminOpeningsPage() {
  const overviewFn = useServerFn(adminOpeningsOverview);
  const importFn = useServerFn(adminRunOpeningImport);
  const breakerFn = useServerFn(adminResetExplorerBreaker);
  const datasetFn = useServerFn(adminSaveOpeningDataset);

  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dataset, setDataset] = useState({ slug: "", name: "", version: "v1", license: "CC0" });

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await overviewFn({}));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "load_failed");
    } finally {
      setBusy(false);
    }
  }, [overviewFn]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, label: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage(label);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "action_failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell module="openings" title="Khai cuộc">
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Dữ liệu khai cuộc</h1>
            <p className="text-sm text-muted-foreground">
              Bộ ECO nhúng theo build, cache Explorer và các import job.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={busy}>
            <RefreshCw className="size-4" /> Tải lại
          </Button>
        </header>

        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}

        {data ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="size-4" /> Bộ ECO nhúng
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  {data.embedded.name} · <span className="font-mono">{data.embedded.version}</span>
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {data.embedded.lines} phương án · {data.embedded.codes} mã ECO
                </p>
                <p className="text-xs text-muted-foreground">
                  Giấy phép {data.embedded.license} — {data.embedded.attribution}
                </p>
                <p className="truncate text-xs text-muted-foreground">{data.embedded.sourceUrl}</p>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(() => importFn({ data: { kind: "eco_refresh" } }), "Đã làm mới ECO")}
                  >
                    <Zap className="size-4" /> Làm mới ECO
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void run(() => importFn({ data: { kind: "cache_purge" } }), "Đã xoá cache")}
                  >
                    <Trash2 className="size-4" /> Xoá cache Explorer
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cache & sức khoẻ nguồn</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-mono text-xs text-muted-foreground">{data.cache.rows} bản ghi cache</p>
                {data.cache.sources.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Chưa có số liệu.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1 text-left">Nguồn</th>
                        <th className="px-2 py-1 text-right">Yêu cầu</th>
                        <th className="px-2 py-1 text-right">Hit</th>
                        <th className="px-2 py-1 text-right">Lỗi</th>
                        <th className="px-2 py-1 text-right">Timeout</th>
                        <th className="px-2 py-1 text-right">Trễ TB</th>
                        <th className="px-2 py-1 text-right">Breaker</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {data.cache.sources.map((s) => (
                        <tr key={s.source} className="border-t border-border/50">
                          <td className="px-2 py-1">{s.source}</td>
                          <td className="px-2 py-1 text-right">{s.requests}</td>
                          <td className="px-2 py-1 text-right">{Math.round(s.hitRate * 100)}%</td>
                          <td className="px-2 py-1 text-right">{s.errors}</td>
                          <td className="px-2 py-1 text-right">{s.timeouts}</td>
                          <td className="px-2 py-1 text-right">{s.avgLatencyMs}ms</td>
                          <td className="px-2 py-1 text-right">{s.openUntil ? "mở" : "—"}</td>
                          <td className="px-2 py-1 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2"
                              disabled={busy}
                              onClick={() =>
                                void run(() => breakerFn({ data: { source: s.source } }), "Đã reset breaker")
                              }
                            >
                              Reset
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Import job gần đây</CardTitle>
              </CardHeader>
              <CardContent>
                {data.jobs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Chưa có job nào.</p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {data.jobs.map((j) => (
                      <li key={j.id} className="flex items-center justify-between gap-2 font-mono">
                        <span>
                          {j.kind} · {j.status}
                        </span>
                        <span className="text-muted-foreground">
                          {j.processed} xử lý · {j.failed} lỗi · {j.createdAt.slice(0, 19).replace("T", " ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dataset đã đăng ký</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1 text-xs">
                  {data.datasets.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono">
                        {d.slug} · {d.version} · {d.ecoCount} mục
                      </span>
                      <span className="text-muted-foreground">{d.license}</span>
                    </li>
                  ))}
                </ul>
                <div className="grid gap-2 sm:grid-cols-4">
                  <Input
                    placeholder="slug"
                    value={dataset.slug}
                    onChange={(e) => setDataset((d) => ({ ...d, slug: e.target.value }))}
                  />
                  <Input
                    placeholder="tên"
                    value={dataset.name}
                    onChange={(e) => setDataset((d) => ({ ...d, name: e.target.value }))}
                  />
                  <Input
                    placeholder="phiên bản"
                    value={dataset.version}
                    onChange={(e) => setDataset((d) => ({ ...d, version: e.target.value }))}
                  />
                  <Input
                    placeholder="giấy phép"
                    value={dataset.license}
                    onChange={(e) => setDataset((d) => ({ ...d, license: e.target.value }))}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={busy || dataset.slug.length < 2 || dataset.name.length < 2}
                  onClick={() =>
                    void run(
                      () =>
                        datasetFn({
                          data: {
                            slug: dataset.slug,
                            name: dataset.name,
                            version: dataset.version,
                            license: dataset.license,
                            attribution: "",
                            sourceUrl: "",
                            notes: "",
                            active: true,
                          },
                        }),
                      "Đã lưu dataset",
                    )
                  }
                >
                  Lưu dataset
                </Button>
              </CardContent>
            </Card>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Đang tải…</p>
        )}
      </div>
    </AdminShell>
  );
}
