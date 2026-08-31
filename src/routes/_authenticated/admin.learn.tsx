import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, Plus, RefreshCw, Save, Trash2, Upload, History } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { APP } from "@/config/app";
import { useT } from "@/lib/i18n";
import { localized, LessonDocSchema, CourseDocSchema } from "@/lib/learn/lessonTypes";
import {
  adminLearnOverview,
  createCourse,
  createLesson,
  deleteContent,
  learnAnalytics,
  listVersions,
  publishContent,
  restoreVersion,
  saveCourseDraft,
  saveLessonDraft,
  unpublishContent,
  type AdminCourse,
  type AdminLesson,
} from "@/lib/learn/adminLearn.functions";

export const Route = createFileRoute("/_authenticated/admin/learn")({
  head: () => ({
    meta: [
      { title: `Học viện · ${APP.name}` },
      {
        name: "description",
        content: "Quản trị nội dung Học viện Nine64: khoá học, bài học tương tác, bản nháp và xuất bản.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Học viện · ${APP.name}` },
      { property: "og:description", content: "Công cụ nội bộ quản lý nội dung Học viện." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLearnPage,
});

type Analytics = Awaited<ReturnType<typeof learnAnalytics>>;
type Selection =
  | { entity: "course"; course: AdminCourse }
  | { entity: "lesson"; course: AdminCourse; lesson: AdminLesson }
  | null;

function AdminLearnPage() {
  const { t, locale } = useT();
  const overviewFn = useServerFn(adminLearnOverview);
  const analyticsFn = useServerFn(learnAnalytics);
  const createCourseFn = useServerFn(createCourse);
  const createLessonFn = useServerFn(createLesson);
  const saveCourseFn = useServerFn(saveCourseDraft);
  const saveLessonFn = useServerFn(saveLessonDraft);
  const publishFn = useServerFn(publishContent);
  const unpublishFn = useServerFn(unpublishContent);
  const deleteFn = useServerFn(deleteContent);
  const versionsFn = useServerFn(listVersions);
  const restoreFn = useServerFn(restoreVersion);

  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [selected, setSelected] = useState<{ entity: "course" | "lesson"; id: string } | null>(null);
  const [editor, setEditor] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<
    { id: string; version: number; note: string; createdAt: string }[]
  >([]);
  const [newCourse, setNewCourse] = useState({
    slug: "",
    kind: "course" as "course" | "endgame",
    track: "",
    titleVi: "",
    titleEn: "",
  });
  const [newLesson, setNewLesson] = useState({ slug: "", titleVi: "", titleEn: "" });

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [tree, stats] = await Promise.all([overviewFn({}), analyticsFn({})]);
      setCourses(tree.courses);
      setAnalytics(stats);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "load_failed");
    } finally {
      setBusy(false);
    }
  }, [analyticsFn, overviewFn]);

  useEffect(() => {
    void load();
  }, [load]);

  const selection: Selection = useMemo(() => {
    if (!selected) return null;
    for (const course of courses) {
      if (selected.entity === "course" && course.id === selected.id) return { entity: "course", course };
      const lesson = course.lessons.find((l) => l.id === selected.id);
      if (selected.entity === "lesson" && lesson) return { entity: "lesson", course, lesson };
    }
    return null;
  }, [courses, selected]);

  const openEditor = useCallback((entity: "course" | "lesson", id: string, doc: unknown) => {
    setSelected({ entity, id });
    setEditor(JSON.stringify(doc, null, 2));
    setVersions([]);
    setMessage(null);
  }, []);

  const save = useCallback(async () => {
    if (!selection) return;
    setBusy(true);
    setMessage(null);
    try {
      const parsed: unknown = JSON.parse(editor);
      if (selection.entity === "course") {
        CourseDocSchema.parse(parsed);
        await saveCourseFn({ data: { id: selection.course.id, doc: parsed } });
      } else {
        LessonDocSchema.parse(parsed);
        await saveLessonFn({ data: { id: selection.lesson.id, doc: parsed } });
      }
      setMessage(t("academy.admin.saved"));
      await load();
    } catch (err) {
      setMessage(t("academy.admin.invalid", { message: err instanceof Error ? err.message : "error" }));
    } finally {
      setBusy(false);
    }
  }, [editor, load, saveCourseFn, saveLessonFn, selection, t]);

  const publish = useCallback(async () => {
    if (!selection) return;
    setBusy(true);
    try {
      const id = selection.entity === "course" ? selection.course.id : selection.lesson.id;
      const res = await publishFn({ data: { entity: selection.entity, id, note: "" } });
      setMessage(t("academy.admin.published", { n: res.version }));
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "publish_failed");
    } finally {
      setBusy(false);
    }
  }, [load, publishFn, selection, t]);

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
        await load();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "action_failed");
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const selectedId = selection
    ? selection.entity === "course"
      ? selection.course.id
      : selection.lesson.id
    : null;

  return (
    <AdminShell module="learn" title={t("academy.admin.title")}>
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <GraduationCap className="size-5" />
              {t("academy.admin.title")}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("academy.admin.subtitle")}
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>
            <RefreshCw className="mr-1.5 size-4" />
            {t("academy.admin.analytics")}
          </Button>
        </header>

        {message ? (
          <p className="rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-sm">{message}</p>
        ) : null}

        {analytics ? (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["academy.admin.learners", analytics.learners],
              ["academy.admin.active7d", analytics.activeLearners7d],
              ["academy.admin.started", analytics.startedLessons],
              ["academy.admin.completions", analytics.completedLessons],
              ["academy.admin.avgMastery", analytics.avgMastery],
              ["academy.admin.dueCards", analytics.dueCards],
            ].map(([key, value]) => (
              <Card key={String(key)}>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">{t(String(key))}</p>
                  <p className="font-mono text-lg">{String(value)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("academy.admin.newCourse")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input
                  placeholder={t("academy.admin.slug")}
                  value={newCourse.slug}
                  onChange={(e) => setNewCourse({ ...newCourse, slug: e.target.value })}
                />
                <Input
                  placeholder={t("academy.admin.titleVi")}
                  value={newCourse.titleVi}
                  onChange={(e) => setNewCourse({ ...newCourse, titleVi: e.target.value })}
                />
                <Input
                  placeholder={t("academy.admin.titleEn")}
                  value={newCourse.titleEn}
                  onChange={(e) => setNewCourse({ ...newCourse, titleEn: e.target.value })}
                />
                <Input
                  placeholder={t("academy.admin.track")}
                  value={newCourse.track}
                  onChange={(e) => setNewCourse({ ...newCourse, track: e.target.value })}
                />
                <div className="flex gap-2">
                  {(["course", "endgame"] as const).map((kind) => (
                    <Button
                      key={kind}
                      type="button"
                      size="sm"
                      variant={newCourse.kind === kind ? "default" : "outline"}
                      onClick={() => setNewCourse({ ...newCourse, kind })}
                    >
                      {t(`academy.admin.kind.${kind}`)}
                    </Button>
                  ))}
                </div>
                <Button
                  size="sm"
                  disabled={busy || !newCourse.slug || !newCourse.titleVi || !newCourse.titleEn}
                  onClick={() =>
                    void act(async () => {
                      await createCourseFn({
                        data: {
                          slug: newCourse.slug,
                          kind: newCourse.kind,
                          titleVi: newCourse.titleVi,
                          titleEn: newCourse.titleEn,
                          ...(newCourse.track ? { track: newCourse.track } : {}),
                        },
                      });
                      setNewCourse({ slug: "", kind: "course", track: "", titleVi: "", titleEn: "" });
                    })
                  }
                >
                  <Plus className="mr-1.5 size-4" />
                  {t("academy.admin.create")}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("academy.admin.courses")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {courses.map((course) => (
                  <div key={course.id} className="rounded-lg border border-border/60 p-2">
                    <button
                      type="button"
                      onClick={() => openEditor("course", course.id, course.doc)}
                      className={`w-full text-left text-sm font-medium ${
                        selectedId === course.id ? "text-primary" : ""
                      }`}
                    >
                      {localized(course.doc.title, locale)}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {t(`academy.admin.status.${course.status}`)}
                        {course.draftDirty ? ` · ${t("academy.admin.dirty")}` : ""}
                      </span>
                    </button>
                    <ul className="mt-1 space-y-1 border-l border-border/60 pl-2">
                      {course.lessons.map((lesson) => (
                        <li key={lesson.id}>
                          <button
                            type="button"
                            onClick={() => openEditor("lesson", lesson.id, lesson.doc)}
                            className={`w-full text-left text-xs ${
                              selectedId === lesson.id ? "text-primary" : "text-muted-foreground"
                            }`}
                          >
                            {localized(lesson.doc.title, locale)}
                            {lesson.draftDirty ? " ·*" : ""}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {selection?.course.id === course.id ? (
                      <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                        <Input
                          className="h-8"
                          placeholder={t("academy.admin.slug")}
                          value={newLesson.slug}
                          onChange={(e) => setNewLesson({ ...newLesson, slug: e.target.value })}
                        />
                        <Input
                          className="h-8"
                          placeholder={t("academy.admin.titleVi")}
                          value={newLesson.titleVi}
                          onChange={(e) => setNewLesson({ ...newLesson, titleVi: e.target.value })}
                        />
                        <Input
                          className="h-8"
                          placeholder={t("academy.admin.titleEn")}
                          value={newLesson.titleEn}
                          onChange={(e) => setNewLesson({ ...newLesson, titleEn: e.target.value })}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || !newLesson.slug || !newLesson.titleVi}
                          onClick={() =>
                            void act(async () => {
                              await createLessonFn({
                                data: {
                                  courseId: course.id,
                                  slug: newLesson.slug,
                                  titleVi: newLesson.titleVi,
                                  titleEn: newLesson.titleEn || newLesson.titleVi,
                                },
                              });
                              setNewLesson({ slug: "", titleVi: "", titleEn: "" });
                            })
                          }
                        >
                          <Plus className="mr-1.5 size-4" />
                          {t("academy.admin.newLesson")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("academy.admin.editor")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selection ? (
                <p className="text-sm text-muted-foreground">{t("academy.admin.editorHint")}</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">{t("academy.admin.editorHint")}</p>
                  <textarea
                    value={editor}
                    onChange={(e) => setEditor(e.target.value)}
                    spellCheck={false}
                    className="h-[26rem] w-full rounded-lg border border-border/70 bg-background/60 p-3 font-mono text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void save()}>
                      <Save className="mr-1.5 size-4" />
                      {t("academy.admin.save")}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void publish()}>
                      <Upload className="mr-1.5 size-4" />
                      {t("academy.admin.publish")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void act(() =>
                          unpublishFn({
                            data: {
                              entity: selection.entity,
                              id:
                                selection.entity === "course"
                                  ? selection.course.id
                                  : selection.lesson.id,
                            },
                          }),
                        )
                      }
                    >
                      {t("academy.admin.unpublish")}
                    </Button>
                    {selection.entity === "lesson" ? (
                      <Button size="sm" variant="ghost" asChild>
                        <Link to="/learn/lesson/$slug" params={{ slug: selection.lesson.slug }}>
                          {t("academy.admin.preview")}
                        </Link>
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" asChild>
                        <Link to="/learn/course/$slug" params={{ slug: selection.course.slug }}>
                          {t("academy.admin.preview")}
                        </Link>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void versionsFn({
                          data: {
                            entity: selection.entity,
                            id:
                              selection.entity === "course"
                                ? selection.course.id
                                : selection.lesson.id,
                          },
                        })
                          .then((res) => setVersions(res.versions))
                          .catch(() => setVersions([]))
                      }
                    >
                      <History className="mr-1.5 size-4" />
                      {t("academy.admin.versions")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(t("academy.admin.confirmDelete"))) return;
                        void act(async () => {
                          await deleteFn({
                            data: {
                              entity: selection.entity,
                              id:
                                selection.entity === "course"
                                  ? selection.course.id
                                  : selection.lesson.id,
                            },
                          });
                          setSelected(null);
                        });
                      }}
                    >
                      <Trash2 className="mr-1.5 size-4" />
                      {t("academy.admin.delete")}
                    </Button>
                  </div>

                  {versions.length > 0 ? (
                    <ul className="space-y-1 text-xs">
                      {versions.map((version) => (
                        <li key={version.id} className="flex items-center gap-2">
                          <span className="font-mono">{t("academy.admin.version", { n: version.version })}</span>
                          <span className="text-muted-foreground">
                            {new Date(version.createdAt).toLocaleString()}
                          </span>
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() =>
                              void act(() => restoreFn({ data: { versionId: version.id } }))
                            }
                          >
                            {t("academy.admin.restore")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
