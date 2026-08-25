import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CheckCircle2, Circle, Dumbbell, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { SEVERITY_META } from "@/lib/coach/types";
import { useGameHistory } from "@/lib/history";
import {
  buildDrills,
  clearDrillProgress,
  setDrillDone,
  useDrillProgress,
  type Drill,
} from "@/lib/learn/drills";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/drills/")({
  head: () =>
    pageHead({
      path: "/drills",
      title: `Bài tập theo lỗi của bạn — ${APP.name}`,
      description:
        "Bài tập sinh từ những sai lầm trầm trọng nhất trong các ván của bạn, có thể đánh dấu đã luyện xong.",
    }), => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f === "todo" ? "Chưa xong" : f === "done" ? "Đã xong" : "Tất cả"}
            </Button>
          ))}
        </div>
      </div>

      <div className="panel mt-4 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">
            Tiến độ luyện tập{" "}
            <span className="tabular text-muted-foreground">
              {completed}/{drills.length}
            </span>
          </span>
          <span className="tabular font-display text-lg font-bold">{percent}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        {completed > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => clearDrillProgress()}
          >
            <RotateCcw className="size-4" /> Đặt lại tiến độ
          </Button>
        )}
      </div>

      {drills.length === 0 ? (
        <div className="panel mt-4 p-6 text-center">
          <Dumbbell className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Chưa có bài tập nào. Hãy chạy engine review (hoặc phân tích sâu) cho một ván trong{" "}
            <Link to="/games" className="text-primary underline">
              ván của tôi
            </Link>{" "}
            để hệ thống tìm ra lỗi và tạo bài tập.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map((drill) => (
            <DrillRow key={drill.id} drill={drill} doneAt={done[drill.id] ?? null} />
          ))}
          {shown.length === 0 && (
            <li className="panel p-6 text-center text-sm text-muted-foreground">
              {filter === "todo"
                ? "Bạn đã luyện xong toàn bộ bài tập hiện có. Chơi thêm ván mới để tạo bài tập mới."
                : "Chưa có bài tập nào trong mục này."}
            </li>
          )}
        </ul>
      )}
    </AppShell>
  );
}

function DrillRow({ drill, doneAt }: { drill: Drill; doneAt: string | null }) {
  const meta = SEVERITY_META[drill.severity] ?? SEVERITY_META.moderate;
  return (
    <li className={`panel border p-4 ${doneAt ? "opacity-60" : ""} ${meta.ring}`}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label={doneAt ? "Bỏ đánh dấu đã luyện" : "Đánh dấu đã luyện xong"}
          aria-pressed={!!doneAt}
          onClick={() => setDrillDone(drill.id, !doneAt)}
          className="mt-0.5 shrink-0 text-primary transition-transform hover:scale-110"
        >
          {doneAt ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-semibold uppercase tracking-wider ${meta.tone}`}>
              {meta.title}
            </span>
            {drill.loss !== null && (
              <span className="tabular text-xs text-muted-foreground">-{drill.loss}%</span>
            )}
            {drill.themes.map((t) => (
              <span key={t} className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
                {t}
              </span>
            ))}
          </div>

          <h2 className={`mt-1 text-sm font-semibold ${doneAt ? "line-through" : ""}`}>
            {drill.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{drill.problem}</p>
          <p className="mt-2 text-sm">
            <span className="font-semibold">Cần luyện: </span>
            {drill.task}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="truncate">{drill.gameLabel}</span>
            <Link
              to="/games/$gameId"
              params={{ gameId: drill.gameId }}
              className="text-primary underline"
            >
              Mở ván{drill.ply !== null ? ` tại ${drill.moveLabel} ${drill.san ?? ""}` : ""}
            </Link>
            {doneAt && (
              <span>Đã luyện {new Date(doneAt).toLocaleDateString("vi-VN")}</span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
