import { createFileRoute, Link } from "@tanstack/react-router";
import { WifiOff } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/offline")({
  head: () =>
    pageHead({
      path: "/offline",
      title: `Đang ngoại tuyến — ${APP.name}`,
      description:
        "Bạn đang mất kết nối. Các chế độ chơi ngoại tuyến của Nine64 vẫn dùng được: đấu bot, cờ tại chỗ và bàn phân tích.",
      noindex: true,
    }),
  component: OfflinePage,
});

const OFFLINE_LINKS = [
  { to: "/play/ai" as const, label: "Đấu với bot (engine cục bộ)" },
  { to: "/play/local" as const, label: "Cờ hai người tại chỗ" },
  { to: "/analysis" as const, label: "Bàn phân tích" },
  { to: "/puzzles" as const, label: "Bài tập đã tải" },
  { to: "/learn" as const, label: "Bài học đã lưu" },
];

function OfflinePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-xl py-10 text-center">
        <WifiOff className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold">Bạn đang ngoại tuyến</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Không có kết nối mạng. Những phần chạy hoàn toàn trên thiết bị vẫn hoạt động bình thường —
          đấu online, xếp hạng và đồng bộ sẽ trở lại khi có mạng.
        </p>
        <ul className="mt-6 grid gap-2 text-left">
          {OFFLINE_LINKS.map((link) => (
            <li key={link.to}>
              <Link
                to={link.to}
                className="block rounded-md border border-border/70 bg-surface-1 px-4 py-3 text-sm font-medium hover:border-brass/60"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
