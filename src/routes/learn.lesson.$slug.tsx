import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardSkeleton } from "@/components/layout/PageSkeleton";
import { LessonPlayer } from "@/components/learn/LessonPlayer";
import { getLesson } from "@/lib/learn/learn.functions";
import { localized } from "@/lib/learn/lessonTypes";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/learn/lesson/$slug")({
  loader: async ({ params }) => {
    const data = await getLesson({ data: { slug: params.slug } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: `Không tìm thấy bài học — ${APP.name}` }, { name: "robots", content: "noindex" }] };
    }
    const title = loaderData.lesson.doc.title.vi || loaderData.lesson.doc.title.en;
    return pageHead({
      path: `/learn/lesson/${loaderData.lesson.slug}`,
      title: `${title} — ${APP.name}`,
      description:
        loaderData.lesson.doc.summary.vi ||
        loaderData.lesson.doc.summary.en ||
        `Bài học cờ vua tương tác: ${title}.`,
    });
  },
  pendingComponent: DashboardSkeleton,
  notFoundComponent: () => <Missing />,
  errorComponent: () => <Missing />,
  component: LessonPage,
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

function LessonPage() {
  const { t, locale } = useT();
  const navigate = useNavigate();
  const { lesson, course, siblings } = Route.useLoaderData();
  const index = siblings.findIndex((s) => s.id === lesson.id);
  const next = index >= 0 ? siblings[index + 1] : undefined;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
        <Link
          to="/learn/course/$slug"
          params={{ slug: course.slug }}
          className="text-sm text-muted-foreground hover:text-primary"
        >
          ← {t("academy.backToCourse")}: {localized(course.doc.title, locale)}
        </Link>
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            {localized(lesson.doc.title, locale)}
          </h1>
          {lesson.doc.summary.vi || lesson.doc.summary.en ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {localized(lesson.doc.summary, locale)}
            </p>
          ) : null}
        </header>

        <LessonPlayer
          key={lesson.id}
          lesson={lesson}
          nextLessonSlug={next?.slug ?? null}
          onOpenNext={() => {
            if (next) void navigate({ to: "/learn/lesson/$slug", params: { slug: next.slug } });
          }}
        />
      </div>
    </AppShell>
  );
}
