import { Link } from "@tanstack/react-router";
import { BookOpen, GraduationCap } from "lucide-react";
import { localized, type CourseRecord, type LessonProgress } from "@/lib/learn/lessonTypes";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  courses: CourseRecord[];
  lessonCounts: Record<string, number>;
  progressByCourse?: Record<string, { done: number; total: number; mastery: number }>;
}

export function CourseGrid({ courses, lessonCounts, progressByCourse = {} }: Props) {
  const { t, locale } = useT();
  if (courses.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("academy.empty")}</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => {
        const stats = progressByCourse[course.id];
        const total = lessonCounts[course.id] ?? 0;
        return (
          <li key={course.id}>
            <Link
              to="/learn/course/$slug"
              params={{ slug: course.slug }}
              className="group flex h-full flex-col rounded-xl border border-border/70 bg-card/60 p-4 transition hover:border-primary/60 hover:bg-primary/5"
            >
              <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                {course.kind === "endgame" ? (
                  <GraduationCap className="size-4" />
                ) : (
                  <BookOpen className="size-4" />
                )}
                {t(`academy.level.${course.doc.level}`)}
                {course.track ? <span className="text-muted-foreground/70">· {course.track}</span> : null}
              </span>
              <h3 className="mt-2 text-base font-semibold group-hover:text-primary">
                {localized(course.doc.title, locale)}
              </h3>
              <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                {localized(course.doc.summary, locale)}
              </p>
              <div className="mt-auto pt-3 text-xs text-muted-foreground">
                <span className="font-mono">{t("academy.lessons", { count: total })}</span>
                {stats && stats.total > 0 ? (
                  <>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full bg-primary")}
                        style={{ width: `${Math.round((stats.done / stats.total) * 100)}%` }}
                      />
                    </div>
                    <span className="mt-1 block font-mono">
                      {stats.done}/{stats.total} · {t("academy.mastery", { value: stats.mastery })}
                    </span>
                  </>
                ) : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
