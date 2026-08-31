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

export const Route = createFileRoute("/learn/")({
  head: () =>
    pageHead({
      path: "/learn",
      title: `Học viện cờ vua — ${APP.name}`,
      description:
        "Khoá học cờ vua tương tác: bài giảng trên bàn cờ, tìm nước đúng, câu hỏi kiểm tra và lịch ôn tập thông minh.",
    }),
  pendingComponent: DashboardSkeleton,
  loader: () => listCourses({ data: { kind: "course" } }),
  errorComponent: () => <AcademyError />,
  component: LearnIndex,
});

function AcademyError() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">
        Không tải được nội dung Học viện. Vui lòng thử lại.
      </div>
    </AppShell>
  );
}

function LearnIndex() {
  const { t } = useT();
  const { user } = useAuth();
  const { courses, lessonCounts } = Route.useLoaderData();
  const progressFn = useServerFn(myProgress);
  const [progress, setProgress] = useState<{ progress: LessonProgress[]; dueCards: number } | null>(null);

  useEffect(() => {
    if (!user) {
      setProgress(null);
      return;
    }
    void progressFn({}).then(setProgress).catch(() => setProgress(null));
  }, [progressFn, user]);

  const done = progress?.progress.filter((p) => p.status === "completed").length ?? 0;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{t("academy.title")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("academy.subtitle")}</p>
        </header>

        {user ? (
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-lg border border-border/70 bg-card/60 px-3 py-2 font-mono">
              {t("academy.completed")}: {done}
            </span>
            <span className="rounded-lg border border-border/70 bg-card/60 px-3 py-2 font-mono">
              {t("academy.dueCards", { count: progress?.dueCards ?? 0 })}
            </span>
          </div>
        ) : (
          <p className="rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-sm text-muted-foreground">
            {t("academy.signInHint")}
          </p>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("academy.courses")}</h2>
          <CourseGrid courses={courses} lessonCounts={lessonCounts} />
        </section>

        <p className="text-sm">
          <Link to="/endgames" className="text-primary hover:underline">
            {t("academy.endgames.title")} →
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
