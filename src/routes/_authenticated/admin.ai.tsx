import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bot, Search } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AI_ROSTER } from "@/config/aiRoster";

export const Route = createFileRoute("/_authenticated/admin/ai")({
  head: () => ({
    meta: [
      { title: "AI Player Network · Nine64 Admin" },
      {
        name: "description",
        content:
          "Danh sách 100 đối thủ AI của Nine64 dùng làm phương án dự phòng trong ghép cặp xếp hạng.",
      },
      { property: "og:title", content: "AI Player Network · Nine64 Admin" },
      {
        property: "og:description",
        content: "Quản trị mạng lưới đối thủ AI xếp hạng của Nine64.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAiPage,
});

function AdminAiPage() {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? AI_ROSTER.filter(
          (a) =>
            a.name.toLowerCase().includes(needle) ||
            a.key.includes(needle) ||
            a.personality.includes(needle),
        )
      : AI_ROSTER;
    return [...list].sort((a, b) => b.targetRating - a.targetRating);
  }, [q]);

  return (
    <AdminShell>
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4" /> AI Player Network ({AI_ROSTER.length})
            </CardTitle>
            <div className="relative w-64 max-w-full">
              <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm tên, khoá hoặc phong cách"
                className="pl-8"
              />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4 text-sm">
              Bật/tắt và tỉ lệ triển khai được cấu hình tại Hệ thống → cài đặt{" "}
              <code>ranked_ai_enabled</code>, <code>ranked_ai_fallback_delay_ms</code>,{" "}
              <code>ranked_ai_rollout_percent</code>. Mọi ván đấu với AI đều hiển thị nhãn AI cho
              người chơi.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left">
                  <tr>
                    <th className="py-2 pr-4">Tên</th>
                    <th className="py-2 pr-4">Khoá</th>
                    <th className="py-2 pr-4 font-mono">Hệ số</th>
                    <th className="py-2 pr-4">Phong cách</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.key} className="border-border/60 border-t">
                      <td className="py-2 pr-4">
                        {a.name} <Badge variant="secondary">AI</Badge>
                      </td>
                      <td className="text-muted-foreground py-2 pr-4 font-mono text-xs">{a.key}</td>
                      <td className="py-2 pr-4 font-mono">{a.targetRating}</td>
                      <td className="py-2 pr-4">{a.personality}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
