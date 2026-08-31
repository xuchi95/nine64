import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, Link2, RefreshCw, ShieldOff, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APP } from "@/config/app";
import { pageHead, SITE_URL } from "@/lib/seo";
import {
  createStudy,
  deleteStudy,
  importStudyPgn,
  listMyStudies,
  rotateStudySlug,
  updateStudy,
} from "@/lib/study/studies.functions";
import type { ShareMode, StudySummary, Visibility } from "@/lib/study/types";

export const Route = createFileRoute("/_authenticated/studies")({
  head: () =>
    pageHead({
      path: "/studies",
      title: `Study & Chia sẻ | ${APP.name}`,
      description:
        "Tạo study từ PGN, quản lý chương, biến và chú giải, đặt chế độ riêng tư / không công khai / công khai và thu hồi liên kết chia sẻ bất kỳ lúc nào.",
      noindex: true,
    }),
  component: StudiesPage,
});

const MODE_LABEL: Record<ShareMode, string> = {
  game: "Ván cờ",
  position: "Thế cờ",
  annotated: "Ván có chú giải",
  study: "Study nhiều chương",
};

const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: "Riêng tư",
  unlisted: "Không công khai (chỉ ai có link)",
  public: "Công khai",
};

function StudiesPage() {
  const queryClient = useQueryClient();
  const list = useServerFn(listMyStudies);
  const create = useServerFn(createStudy);
  const importPgn = useServerFn(importStudyPgn);
  const update = useServerFn(updateStudy);
  const rotate = useServerFn(rotateStudySlug);
  const remove = useServerFn(deleteStudy);

  const studies = useQuery({ queryKey: ["my-studies"], queryFn: () => list({}) });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<ShareMode>("annotated");
  const [visibility, setVisibility] = useState<Visibility>("unlisted");
  const [pgn, setPgn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["my-studies"] });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const content = await importPgn({ data: { pgn } });
      return create({
        data: {
          title: title.trim(),
          description: description.trim() || null,
          mode,
          visibility,
          engineAllowed: true,
          content,
        },
      });
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setPgn("");
      setError(null);
      invalidate();
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Không tạo được study"),
  });

  const copyLink = useCallback(async (slug: string) => {
    try {
      await navigator.clipboard.writeText(`${SITE_URL}/s/${slug}`);
      setCopied(slug);
      setTimeout(() => setCopied(null), 1_800);
    } catch {
      /* clipboard unavailable */
    }
  }, []);

  const rows = (studies.data ?? []) as StudySummary[];

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-8 py-8">
        <header>
          <h1 className="font-display text-3xl font-bold">Study &amp; Chia sẻ</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Nhập PGN (giữ nguyên header, bình luận và các biến), chọn chế độ hiển thị và chia sẻ bằng
            liên kết ngắn. Mọi study mặc định <strong>không công khai</strong>.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tạo study mới</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="study-title">Tiêu đề</Label>
                <Input
                  id="study-title"
                  value={title}
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ví dụ: Phòng thủ Sicilian — bẫy khai cuộc"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="study-mode">Kiểu chia sẻ</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as ShareMode)}>
                  <SelectTrigger id="study-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MODE_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="study-desc">Mô tả</Label>
              <Input
                id="study-desc"
                value={description}
                maxLength={600}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tuỳ chọn — hiển thị trên thẻ chia sẻ"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="study-pgn">PGN</Label>
              <Textarea
                id="study-pgn"
                value={pgn}
                onChange={(e) => setPgn(e.target.value)}
                rows={8}
                className="font-mono text-xs"
                placeholder={'[Event "Ván của tôi"]\n\n1. e4 e5 {bình luận} (1... c5 2. Nf3) 2. Nf3 *'}
              />
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="w-full space-y-1.5 sm:w-72">
                <Label htmlFor="study-visibility">Chế độ hiển thị</Label>
                <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
                  <SelectTrigger id="study-visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(VISIBILITY_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                disabled={!title.trim() || pgn.trim().length < 3 || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? "Đang tạo…" : "Tạo study"}
              </Button>
            </div>

            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Study của tôi</h2>
          {studies.isLoading ? <p className="text-sm text-muted-foreground">Đang tải…</p> : null}
          {!studies.isLoading && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bạn chưa tạo study nào.</p>
          ) : null}

          {rows.map((study) => (
            <Card key={study.slug}>
              <CardContent className="flex flex-wrap items-center gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{study.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    /s/{study.slug} · {study.chapterCount} chương · {MODE_LABEL[study.mode]}
                  </p>
                </div>

                <Badge variant={study.revoked ? "destructive" : "outline"}>
                  {study.revoked ? "Đã thu hồi" : VISIBILITY_LABEL[study.visibility].split(" (")[0]}
                </Badge>

                <Select
                  value={study.visibility}
                  onValueChange={(v) =>
                    void update({ data: { slug: study.slug, visibility: v as Visibility } }).then(
                      invalidate,
                    )
                  }
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(VISIBILITY_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button variant="outline" size="sm" onClick={() => void copyLink(study.slug)}>
                  {copied === study.slug ? (
                    <Check className="mr-1 size-4" />
                  ) : (
                    <Link2 className="mr-1 size-4" />
                  )}
                  Link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  title="Thu hồi liên kết hiện tại"
                  onClick={() =>
                    void update({ data: { slug: study.slug, revoked: !study.revoked } }).then(
                      invalidate,
                    )
                  }
                >
                  <ShieldOff className="mr-1 size-4" />
                  {study.revoked ? "Bật lại" : "Thu hồi"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  title="Cấp liên kết mới, link cũ hết hiệu lực"
                  onClick={() => void rotate({ data: { slug: study.slug } }).then(invalidate)}
                >
                  <RefreshCw className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove({ data: { slug: study.slug } }).then(invalidate)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
                <a
                  href={`/s/${study.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brass underline"
                >
                  <Copy className="hidden" />
                  Mở
                </a>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
