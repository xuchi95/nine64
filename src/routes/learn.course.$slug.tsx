import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, PlayCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardSkeleton } from "@/components/layout/PageSkeleton";
import { getCourse, myProgress } from "@/lib/learn/learn.functions";
import { localized, type LessonProgress } from "@/lib/learn/lessonTypes";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/learn/course/$slug")({
  loader: async ({ params }) => {
    const data = await getCourse({ data: { slug: params.slug } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: `Không tìm thấy khoá học — ${APP.name}` }, { name: "robots", content: "noindex" }] };
    }
    const title = loaderData.course.doc.title.vi || loaderData.course.doc.title.en;
    return pageHead({
      path: `/learn/course/${loaderData.course.slug}`,
      title: `${title} — ${APP.name}`,
      description:
        loaderData.course.doc.summary.vi ||
        loaderData.course.doc.summary.en ||
        `Khoá học cờ vua tương tác ${title} trên ${APP.name}.`,
    });
  },
  pendingComponent: DashboardSkeleton,
  notFoundComponent: () => <Missing />,
  errorComponent: () => <Missing />,
  component: CoursePage,
});

function Missing() {
  const { t } = useT();
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">
        {t("academy.notFound")}{" "}
        <Link to="/learn" className="text-primary hover:underline">
          {t("academy.backToAcademy")}
        </Link>
      </div>
    </AppShell>
  );
}

function CoursePage() {
  const { t, locale } = useT();
  const { user } = useAuth();
  const { course, lessons } = Route.useLoaderData();
  const progressFn = useServerFn(myProgress);
  const [progress, setProgress] = useState<Record<string, LessonProgress>>({});

  useEffect(() => {
    if (!user) return;
    void progressFn({})
      .then((res) => setProgress(Object.fromEntries(res.progress.map((p) => [p.lessonId, p]))))
      .catch(() => setProgress({}));
  }, [progressFn, user]);

  const chapters =
    course.doc.chapters.length > 0
      ? course.doc.chapters
      : [{ id: "main", title: { vi: "Nội dung", en: "Content" } }];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
        <Link to="/learn" className="text-sm text-muted-foreground hover:text-primary">
          ← {t("academy.backToAcademy")}
        </Link>
        <header>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t(`academy.level.${course.doc.level}`)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {localized(course.doc.title, locale)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{localized(course.doc.summary, locale)}</p>
        </header>

        {chapters.map((chapter) => {
          const items = lessons.filter((l) => (l.chapterId || "main") === chapter.id);
          if (items.length === 0) return null;
          return (
            <section key={chapter.id} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {localized(chapter.title, locale)}
              </h2>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card/60">
                {items.map((lesson) => {
                  const p = progress[lesson.id];
                  const Icon =
                    p?.status === "completed" ? CheckCircle2 : p ? PlayCircle : Circle;
                  return (
                    <li key={lesson.id}>
                      <Link
                        to="/learn/lesson/$slug"
                        params={{ slug: lesson.slug }}
                        className="flex items-center gap-3 px-4 py-3 transition hover:bg-primary/5"
                      >
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            p?.status === "completed" ? "text-emerald-400" : "text-muted-foreground",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {localized(lesson.doc.title, locale)}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {t("academy.minutes", { count: lesson.doc.estimatedMinutes })}
                            {p ? ` · ${t("academy.mastery", { value: p.mastery })}` : ""}
                          </span>
                        </span>
                        <span className="text-xs text-primary">
                          {p?.status === "completed"
                            ? t("academy.review")
                            : p
                              ? t("academy.continue")
                              : t("academy.start")}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
