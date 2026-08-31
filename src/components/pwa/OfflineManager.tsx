import { useCallback, useEffect, useState } from "react";
import { Download, HardDrive, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ENGINE_PACK_ASSETS,
  ENGINE_PACK_ROUTES,
  clearPacks,
  listPacks,
  offlineSupported,
  removePack,
  savePack,
  storageUsage,
  type OfflinePack,
} from "@/lib/pwa/offlinePacks";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Lets the user download the offline engine pack and manage everything already
 * saved for offline use (lessons, puzzles, repertoires).
 */
export function OfflineManager() {
  const [packs, setPacks] = useState<OfflinePack[]>([]);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const supported = offlineSupported();

  const refresh = useCallback(async () => {
    setPacks(listPacks());
    setUsage(await storageUsage());
  }, []);

  useEffect(() => {
    if (supported) void refresh();
  }, [supported, refresh]);

  const downloadEngine = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await savePack({
        id: "engine-core",
        kind: "engine",
        title: "Engine Stockfish + màn chơi ngoại tuyến",
        data: { version: "18-lite" },
        routes: ENGINE_PACK_ROUTES,
        assets: ENGINE_PACK_ASSETS,
      });
      setMessage("Đã tải xong. Bạn có thể đấu bot và phân tích khi mất mạng.");
      await refresh();
    } catch {
      setMessage("Không tải được gói ngoại tuyến. Hãy thử lại khi có mạng ổn định.");
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return (
      <section className="panel mt-5 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Ngoại tuyến
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Trình duyệt này không hỗ trợ lưu nội dung ngoại tuyến.
        </p>
      </section>
    );
  }

  return (
    <section className="panel mt-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Ngoại tuyến
        </h2>
        <Button size="sm" onClick={downloadEngine} disabled={busy}>
          <Download className="mr-2 h-4 w-4" aria-hidden />
          {busy ? "Đang tải…" : "Tải gói chơi ngoại tuyến"}
        </Button>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Gói ngoại tuyến chỉ chứa nội dung công khai và dữ liệu trên máy bạn. Đấu online, xếp hạng và
        trang quản trị không bao giờ được lưu đệm.
      </p>

      {message && (
        <p className="mt-3 rounded-md border border-border/70 bg-surface-1 px-3 py-2 text-sm">
          {message}
        </p>
      )}

      {usage && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <HardDrive className="h-3.5 w-3.5" aria-hidden />
          Đã dùng {formatBytes(usage.usage)}
          {usage.quota > 0 ? ` / ${formatBytes(usage.quota)}` : ""}
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {packs.length === 0 && (
          <li className="text-sm text-muted-foreground">Chưa có nội dung nào được tải xuống.</li>
        )}
        {packs.map((pack) => (
          <li
            key={pack.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-surface-1 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{pack.title}</p>
              <p className="text-xs text-muted-foreground">
                {pack.kind} · {formatBytes(pack.bytes)}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Xoá ${pack.title}`}
              onClick={async () => {
                await removePack(pack.id);
                await refresh();
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>

      {packs.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={async () => {
            await clearPacks();
            await refresh();
          }}
        >
          Xoá toàn bộ dữ liệu ngoại tuyến
        </Button>
      )}
    </section>
  );
}
