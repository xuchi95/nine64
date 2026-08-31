import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardSkeleton } from "@/components/layout/PageSkeleton";
import { CourseGrid } from "@/components/learn/CourseGrid";
import { listCourses, myProgress } from "@/lib/learn/learn.functions";
import type { LessonProgress } from "@/lib/learn/lessonTypes";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/endgames")({
  head: () =>
    pageHead({
      path: "/endgames",
      title: `Học viện Tàn cuộc — ${APP.name}`,
      description:
        "Luyện tàn cuộc chuẩn xác: vua–tốt, đối lập, xe Lucena và Philidor, hậu, chiếu hết cơ bản — có tra cứu bảng kết thúc.",
    }),
  pendingComponent: DashboardSkeleton,
  loader: () => listCourses({ data: { kind: "endgame" } }),
  errorComponent: () => (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">
        Không tải được nội dung tàn cuộc. Vui lòng thử lại.
      </div>
    </AppShell>
  ),
  component: EndgamesPage,
});

function EndgamesPage() {
  const { t } = useT();
  const { user } = useAuth();
  const { courses, lessonCounts } = Route.useLoaderData();
  const progressFn = useServerFn(myProgress);
  const [progress, setProgress] = useState<LessonProgress[]>([]);

  useEffect(() => {
    if (!user) return;
    void progressFn({})
      .then((res) => setProgress(res.progress))
      .catch(() => setProgress([]));
  }, [progressFn, user]);

  const done = progress.filter((p) => p.status === "completed").length;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{t("academy.endgames.title")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t("academy.endgames.subtitle")}
          </p>
        </header>

        {user ? (
          <p className="text-sm font-mono text-muted-foreground">
            {t("academy.completed")}: {done}
          </p>
        ) : (
          <p className="rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-sm text-muted-foreground">
            {t("academy.signInHint")}
          </p>
        )}

        <CourseGrid courses={courses} lessonCounts={lessonCounts} />

        <p className="text-sm">
          <Link to="/learn" className="text-primary hover:underline">
            ← {t("academy.backToAcademy")}
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
