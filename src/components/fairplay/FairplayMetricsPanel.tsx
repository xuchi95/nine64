import { Activity, AlertTriangle, Gauge, Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FairplayMetrics } from "@/lib/fairplay/metrics";
import { cn } from "@/lib/utils";

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-md border border-border/60 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function FairplayMetricsPanel({ metrics }: { metrics: FairplayMetrics }) {
  const peakDaily = Math.max(1, ...metrics.daily.map((d) => d.reports));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={Activity}
          label="Ván đã soát"
          value={String(metrics.totals.reports)}
          hint={`${metrics.totals.last24h} ván trong 24 giờ qua`}
        />
        <Kpi
          icon={AlertTriangle}
          label="Tỷ lệ cảnh báo"
          value={`${metrics.totals.flagRate}%`}
          hint={`${metrics.totals.flagged} cảnh báo · ${metrics.totals.held} khoá xếp hạng`}
        />
        <Kpi
          icon={Gauge}
          label="Báo động sai"
          value={`${metrics.falseAlarm.rate}%`}
          hint={`${metrics.falseAlarm.clearedCases}/${metrics.falseAlarm.reviewed} hồ sơ tự động bị admin gỡ`}
        />
        <Kpi
          icon={Timer}
          label="Thời gian xử lý"
          value={`${metrics.processing.p50Ms} ms`}
          hint={`p95 ${metrics.processing.p95Ms} ms · max ${metrics.processing.maxMs} ms`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Phát hiện theo phân khúc rating</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-4 py-2 text-left font-medium">Phân khúc</th>
                  <th className="px-3 py-2 text-right font-medium">Ván</th>
                  <th className="px-3 py-2 text-right font-medium">Cảnh báo</th>
                  <th className="px-3 py-2 text-right font-medium">Khoá</th>
                  <th className="px-3 py-2 text-right font-medium">Điểm TB</th>
                  <th className="px-4 py-2 text-right font-medium">p95 ms</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {metrics.segments.map((s) => (
                  <tr key={s.key} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-2 font-sans">{s.label}</td>
                    <td className="px-3 py-2 text-right">{s.reports}</td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right",
                        s.flagRate >= 10 && "text-warning",
                      )}
                    >
                      {s.flagged} ({s.flagRate}%)
                    </td>
                    <td className={cn("px-3 py-2 text-right", s.held > 0 && "text-destructive")}>
                      {s.held} ({s.holdRate}%)
                    </td>
                    <td className="px-3 py-2 text-right">{s.avgScore}</td>
                    <td className="px-4 py-2 text-right">{s.p95EvalMs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">14 ngày gần nhất</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-end gap-1">
              {metrics.daily.map((d) => (
                <div
                  key={d.day}
                  className="flex-1"
                  title={`${d.day}: ${d.reports} ván · ${d.flagged} cảnh báo`}
                >
                  <div className="relative h-32">
                    <div
                      className="absolute bottom-0 w-full rounded-sm bg-muted"
                      style={{ height: `${(d.reports / peakDaily) * 100}%` }}
                    />
                    <div
                      className="absolute bottom-0 w-full rounded-sm bg-destructive/80"
                      style={{ height: `${(d.flagged / peakDaily) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Cột xám: ván đã soát. Cột đỏ: ván bị cảnh báo.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
