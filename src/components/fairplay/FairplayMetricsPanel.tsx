import { Activity, AlertTriangle, Gauge, Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FairplayMetrics } from "@/lib/fairplay/metrics";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

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
  const { t } = useT();
  const peakDaily = Math.max(1, ...metrics.daily.map((d) => d.reports));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={Activity}
          label={t("admin.metrics.reviewed")}
          value={String(metrics.totals.reports)}
          hint={t("admin.metrics.reviewedHint", { n: metrics.totals.last24h })}
        />
        <Kpi
          icon={AlertTriangle}
          label={t("admin.metrics.flagRate")}
          value={`${metrics.totals.flagRate}%`}
          hint={t("admin.metrics.flagRateHint", {
            flagged: metrics.totals.flagged,
            held: metrics.totals.held,
          })}
        />
        <Kpi
          icon={Gauge}
          label={t("admin.metrics.falseAlarm")}
          value={`${metrics.falseAlarm.rate}%`}
          hint={t("admin.metrics.falseAlarmHint", {
            cleared: metrics.falseAlarm.clearedCases,
            reviewed: metrics.falseAlarm.reviewed,
          })}
        />
        <Kpi
          icon={Timer}
          label={t("admin.metrics.processingTime")}
          value={`${metrics.processing.p50Ms} ms`}
          hint={t("admin.metrics.processingTimeHint", {
            p95: metrics.processing.p95Ms,
            max: metrics.processing.maxMs,
          })}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("admin.metrics.bySegment")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-4 py-2 text-left font-medium">{t("admin.metrics.colSegment")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("admin.metrics.colGames")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("admin.metrics.colFlagged")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("admin.metrics.colHeld")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("admin.metrics.colAvgScore")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("admin.metrics.colP95")}</th>
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
            <CardTitle className="text-base">{t("admin.metrics.last14days")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-end gap-1">
              {metrics.daily.map((d) => (
                <div
                  key={d.day}
                  className="flex-1"
                  title={t("admin.metrics.dayTooltip", { day: d.day, reports: d.reports, flagged: d.flagged })}
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
              {t("admin.metrics.chartLegend")}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
