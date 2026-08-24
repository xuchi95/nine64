import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, LineChart, Timer } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { useGameHistory } from "@/lib/history";
import { SEVERITY_META, type MistakeSeverity } from "@/lib/coach/types";
import {
  buildProgress,
  totals,
  trend,
  type Bucket,
  type Granularity,
} from "@/lib/insights/progress";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: `Tiến bộ theo thời gian — ${APP.name}` },
      {
        name: "description",
        content:
          "Theo dõi tiến bộ của bạn qua từng tuần: lỗi nào giảm, % mất cơ hội mỗi nước và thời gian suy nghĩ cải thiện ra sao.",
      },
      { property: "og:title", content: `Tiến bộ theo thời gian — ${APP.name}` },
      {
        property: "og:description",
        content: "Đồ thị % mất cơ hội, số lỗi theo mức độ và nhịp suy nghĩ qua từng giai đoạn.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProgressPage,
});

const SEVERITIES: MistakeSeverity[] = ["basic", "moderate", "serious", "critical"];

function fmt(value: number | null, digits = 1, suffix = ""): string {
  if (value === null || !Number.isFinite(value)) return "–";
  return `${value.toFixed(digits)}${suffix}`;
}

/** Lower is better for loss/mistakes; higher is better for accuracy. */
function DeltaBadge({ change, lowerIsBetter, unit }: { change: number | null; lowerIsBetter: boolean; unit: string }) {
  if (change === null || Math.abs(change) < 0.05) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ArrowRight className="size-3" /> chưa đổi
      </span>
    );
  }
  const improved = lowerIsBetter ? change < 0 : change > 0;
  const Icon = change < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        improved ? "text-success" : "text-destructive"
      }`}
    >
      <Icon className="size-3" />
      <span className="tabular">
        {change > 0 ? "+" : ""}
        {change.toFixed(1)}
        {unit}
      </span>
    </span>
  );
}

function KpiCard({
  title,
  hint,
  value,
  change,
  lowerIsBetter,
  unit,
}: {
  title: string;
  hint: string;
  value: string;
  change: number | null;
  lowerIsBetter: boolean;
  unit: string;
}) {
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="tabular mt-2 font-display text-2xl font-bold">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        <DeltaBadge change={change} lowerIsBetter={lowerIsBetter} unit={unit} />
        <span className="text-xs text-muted-foreground">so với giai đoạn trước</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function TrendChart({
  buckets,
  pick,
  unit,
  lowerIsBetter,
}: {
  buckets: Bucket[];
  pick: (b: Bucket) => number | null;
  unit: string;
  lowerIsBetter: boolean;
}) {
  const rows = buckets
    .map((b) => ({ label: b.label, value: pick(b) }))
    .filter((r): r is { label: string; value: number } => typeof r.value === "number");
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có dữ liệu cho chỉ số này.</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 0.001);
  const w = 100;
  const h = 32;
  const step = rows.length > 1 ? w / (rows.length - 1) : 0;
  const path = rows
    .map((r, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(h - (r.value / max) * (h - 4) - 2).toFixed(2)}`)
    .join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-20 w-full">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1" className="text-primary" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 grid gap-1 text-xs" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
        {rows.map((r, i) => {
          const prev = i > 0 ? (rows[i - 1]?.value ?? null) : null;
          const better = prev === null ? null : lowerIsBetter ? r.value < prev : r.value > prev;
          return (
            <div key={r.label} className="min-w-0 text-center">
              <p
                className={`tabular font-semibold ${
                  better === null ? "" : better ? "text-success" : "text-destructive"
                }`}
              >
                {r.value.toFixed(1)}
                {unit}
              </p>
              <p className="truncate text-muted-foreground">{r.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressPage() {
  const games = useGameHistory();
  const [granularity, setGranularity] = useState<Granularity>("week");

  const buckets = useMemo(() => buildProgress(games, granularity), [games, granularity]);
  const summary = useMemo(() => totals(buckets), [buckets]);
  const lossTrend = useMemo(() => trend(buckets, (b) => b.lossPct), [buckets]);
  const accuracyTrend = useMemo(() => trend(buckets, (b) => b.accuracy), [buckets]);
  const blunderTrend = useMemo(() => trend(buckets, (b) => b.blunders), [buckets]);
  const timeTrend = useMemo(() => trend(buckets, (b) => b.secPerMove), [buckets]);
  const rushTrend = useMemo(
    () => trend(buckets, (b) => (b.rushShare === null ? null : b.rushShare * 100)),
    [buckets],
  );

  const severityTrends = useMemo(
    () =>
      SEVERITIES.map((s) => ({
        severity: s,
        delta: trend(buckets, (b) => (b.points.some((p) => p.severity) ? b.severityPerGame[s] : null)),
      })),
    [buckets],
  );

  const recent = [...buckets].reverse();

  return (
    <AppShell wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Tiến bộ theo thời gian</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tổng hợp từ {summary.games} ván đã phân tích ({summary.moves} nước của bạn). Chỉ số càng
            thấp càng tốt, trừ độ chính xác.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["day", "week", "month"] as Granularity[]).map((g) => (
            <Button
              key={g}
              size="sm"
              variant={granularity === g ? "default" : "outline"}
              onClick={() => setGranularity(g)}
            >
              {g === "day" ? "Ngày" : g === "week" ? "Tuần" : "Tháng"}
            </Button>
          ))}
        </div>
      </div>

      {buckets.length === 0 ? (
        <div className="panel mt-6 p-6 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Chưa có dữ liệu tiến bộ.</p>
          <p className="mt-1">
            Hãy chạy Engine review hoặc Chuyên gia phân tích cho vài ván trong{" "}
            <Link to="/games" className="text-primary underline">
              lịch sử ván đấu
            </Link>{" "}
            — thống kê sẽ xuất hiện ngay sau đó.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="% mất cơ hội / nước"
              hint="Win% bạn đánh mất so với nước tốt nhất của engine."
              value={fmt(summary.lossPct, 1, "%")}
              change={lossTrend.change}
              lowerIsBetter
              unit="%"
            />
            <KpiCard
              title="Độ chính xác"
              hint="Điểm accuracy trung bình cho phía bạn."
              value={fmt(summary.accuracy, 1, "%")}
              change={accuracyTrend.change}
              lowerIsBetter={false}
              unit="%"
            />
            <KpiCard
              title="Blunder / 100 nước"
              hint="Số nước sai nặng do engine gắn nhãn blunder."
              value={fmt(blunderTrend.after ?? null, 1)}
              change={blunderTrend.change}
              lowerIsBetter
              unit=""
            />
            <KpiCard
              title="Giây / nước"
              hint="Thời gian suy nghĩ trung bình mỗi nước của bạn."
              value={fmt(summary.secPerMove, 1, "s")}
              change={timeTrend.change}
              lowerIsBetter={false}
              unit="s"
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="panel p-4">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <LineChart className="size-4 text-primary" /> % mất cơ hội theo giai đoạn
              </h2>
              <div className="mt-3">
                <TrendChart buckets={buckets} pick={(b) => b.lossPct} unit="%" lowerIsBetter />
              </div>
            </div>
            <div className="panel p-4">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <Timer className="size-4 text-primary" /> Nhịp suy nghĩ (giây / nước)
              </h2>
              <div className="mt-3">
                <TrendChart
                  buckets={buckets}
                  pick={(b) => b.secPerMove}
                  unit="s"
                  lowerIsBetter={false}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Tỉ lệ nước đi dưới 2 giây: {fmt(summary.rushShare === null ? null : summary.rushShare * 100, 0, "%")}
                {rushTrend.change !== null && (
                  <>
                    {" "}
                    (<DeltaBadge change={rushTrend.change} lowerIsBetter unit="%" />)
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="panel mt-4 p-4">
            <h2 className="font-display text-base font-semibold">Lỗi nào đang giảm?</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {severityTrends.map(({ severity, delta }) => (
                <div key={severity} className={`rounded-lg border p-3 ${SEVERITY_META[severity].ring}`}>
                  <p className={`text-xs font-semibold ${SEVERITY_META[severity].tone}`}>
                    {SEVERITY_META[severity].title}
                  </p>
                  <p className="tabular mt-1 text-xl font-bold">{fmt(delta.after, 1)}</p>
                  <p className="text-xs text-muted-foreground">lỗi / ván ở giai đoạn gần nhất</p>
                  <div className="mt-1">
                    <DeltaBadge change={delta.change} lowerIsBetter unit="" />
                  </div>
                </div>
              ))}
            </div>
            {summary.coachedGames === 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Mức độ lỗi lấy từ báo cáo của Chuyên gia phân tích — hãy chạy AI review cho vài ván
                để có số liệu.
              </p>
            )}
          </div>

          <div className="panel mt-4 overflow-x-auto p-4">
            <h2 className="font-display text-base font-semibold">Chi tiết theo giai đoạn</h2>
            <table className="mt-3 w-full min-w-[640px] text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="text-right">
                  <th className="pb-2 text-left font-medium">Giai đoạn</th>
                  <th className="pb-2 font-medium">Ván</th>
                  <th className="pb-2 font-medium">Mất cơ hội</th>
                  <th className="pb-2 font-medium">Chính xác</th>
                  <th className="pb-2 font-medium">Sai nhỏ</th>
                  <th className="pb-2 font-medium">Sai vừa</th>
                  <th className="pb-2 font-medium">Blunder</th>
                  <th className="pb-2 font-medium">Giây/nước</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {recent.map((b) => (
                  <tr key={b.key} className="border-t border-border text-right">
                    <td className="py-2 text-left">{b.label}</td>
                    <td className="py-2">{b.games}</td>
                    <td className="py-2">{fmt(b.lossPct, 1, "%")}</td>
                    <td className="py-2">{fmt(b.accuracy, 1, "%")}</td>
                    <td className="py-2">{fmt(b.inaccuracies, 1)}</td>
                    <td className="py-2">{fmt(b.mistakes, 1)}</td>
                    <td className="py-2">{fmt(b.blunders, 1)}</td>
                    <td className="py-2">{fmt(b.secPerMove, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              Sai nhỏ / sai vừa / blunder tính trên 100 nước của bạn.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/drills">Luyện các lỗi còn lại</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/games">Mở lịch sử ván đấu</Link>
            </Button>
          </div>
        </>
      )}
    </AppShell>
  );
}
