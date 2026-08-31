import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Flag, RefreshCw, Power, Calculator } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { APP } from "@/config/app";
import { THEME_KEYS, type ThemeKey } from "@/lib/puzzles/themes";
import {
  adminListPuzzles,
  adminModeratePuzzle,
  adminRecalculateDifficulty,
  adminSaveDataset,
} from "@/lib/puzzles.admin.functions";

export const Route = createFileRoute("/_authenticated/admin/puzzles")({
  head: () => ({
    meta: [
      { title: `Kho câu đố · ${APP.name}` },
      { name: "description", content: "Quản trị catalog câu đố Nine64: gắn cờ, tắt bài lỗi, sửa chủ đề, tính lại độ khó." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Kho câu đố · ${APP.name}` },
      { property: "og:description", content: "Công cụ nội bộ quản lý catalog câu đố." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPuzzlesPage,
});

type Row = Record<string, unknown>;

function AdminPuzzlesPage() {
  const listFn = useServerFn(adminListPuzzles);
  const moderateFn = useServerFn(adminModeratePuzzle);
  const recalcFn = useServerFn(adminRecalculateDifficulty);
  const datasetFn = useServerFn(adminSaveDataset);

  const [search, setSearch] = useState("");
  const [theme, setTheme] = useState<ThemeKey | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof adminListPuzzles>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dataset, setDataset] = useState({ slug: "", name: "", license: "", version: "v1" });

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await listFn({
        data: { search, theme, onlyFlagged, includeDisabled: true, limit: 100 },
      });
      setData(res);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "load_failed");
    } finally {
      setBusy(false);
    }
  }, [listFn, onlyFlagged, search, theme]);

  useEffect(() => {
    void load();
  }, [load]);

  const moderate = async (puzzleId: string, patch: { enabled?: boolean; flagged?: boolean; reason?: string }) => {
    await moderateFn({ data: { puzzleId, reason: patch.reason ?? "", ...patch } }).catch((err: unknown) =>
      setMessage(err instanceof Error ? err.message : "update_failed"),
    );
    await load();
  };

  return (
    <AdminShell
      title="Kho câu đố"
      description="Quản lý catalog: gắn cờ bài sai, tắt bài lỗi, tính lại độ khó theo tỷ lệ giải và khai báo giấy phép dataset."
    >
      {message ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tổng số bài</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-2xl">{data?.total ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Đang bị gắn cờ</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-2xl">{data?.flaggedCount ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Bộ dữ liệu</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-2xl">{data?.datasets.length ?? "—"}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Danh sách câu đố</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
              <RefreshCw className="size-4" /> Tải lại
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await recalcFn({ data: { minAttempts: 10, limit: 500 } }).catch(() => null);
                setBusy(false);
                setMessage(res ? `Đã cập nhật độ khó ${res.updated} bài.` : "recalculate_failed");
                void load();
              }}
            >
              <Calculator className="size-4" /> Tính lại độ khó
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo mã bài"
              className="max-w-xs"
            />
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={theme ?? ""}
              onChange={(e) => setTheme((e.target.value || null) as ThemeKey | null)}
            >
              <option value="">Mọi chủ đề</option>
              {THEME_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
              Chỉ bài bị gắn cờ
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Mã</th>
                  <th>Độ khó</th>
                  <th>Chủ đề</th>
                  <th>Giải/Lượt</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data?.puzzles ?? []).map((raw) => {
                  const p = raw as Row;
                  const id = String(p["id"]);
                  const enabled = p["enabled"] !== false;
                  const flagged = p["flagged"] === true;
                  return (
                    <tr key={id} className="border-t border-border/60">
                      <td className="py-2 font-mono text-xs">{id}</td>
                      <td className="font-mono">{String(p["rating"] ?? "")}</td>
                      <td className="max-w-[240px] truncate text-xs text-muted-foreground">
                        {((p["themes"] as string[] | null) ?? []).join(", ")}
                      </td>
                      <td className="font-mono text-xs">
                        {String(p["solved"] ?? 0)}/{String(p["attempts"] ?? 0)}
                      </td>
                      <td className="text-xs">
                        {enabled ? "Đang bật" : "Đã tắt"}
                        {flagged ? " · gắn cờ" : ""}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void moderate(id, { flagged: !flagged, reason: "admin review" })}
                        >
                          <Flag className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void moderate(id, { enabled: !enabled })}>
                          <Power className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data && data.puzzles.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Không có bài nào khớp bộ lọc.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bộ dữ liệu &amp; giấy phép</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <Input
              value={dataset.slug}
              onChange={(e) => setDataset({ ...dataset, slug: e.target.value })}
              placeholder="mã (lichess-2026)"
            />
            <Input
              value={dataset.name}
              onChange={(e) => setDataset({ ...dataset, name: e.target.value })}
              placeholder="Tên hiển thị"
            />
            <Input
              value={dataset.license}
              onChange={(e) => setDataset({ ...dataset, license: e.target.value })}
              placeholder="Giấy phép (CC0)"
            />
            <Input
              value={dataset.version}
              onChange={(e) => setDataset({ ...dataset, version: e.target.value })}
              placeholder="Phiên bản"
            />
          </div>
          <Button
            size="sm"
            disabled={busy || !dataset.slug || !dataset.name || !dataset.license}
            onClick={async () => {
              setBusy(true);
              const res = await datasetFn({
                data: {
                  slug: dataset.slug,
                  name: dataset.name,
                  license: dataset.license,
                  licenseUrl: "",
                  sourceUrl: "",
                  attribution: "",
                  version: dataset.version,
                  notes: "",
                },
              }).catch(() => null);
              setBusy(false);
              setMessage(res ? "Đã lưu bộ dữ liệu." : "dataset_failed");
              void load();
            }}
          >
            Lưu bộ dữ liệu
          </Button>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {(data?.datasets ?? []).map((raw) => {
              const d = raw as Row;
              return (
                <li key={String(d["slug"])}>
                  <span className="font-mono text-xs">{String(d["slug"])}</span> · {String(d["name"] ?? "")} ·{" "}
                  {String(d["license"] ?? "")} · {String(d["imported_count"] ?? 0)} bài
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
