import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { BoardSkeleton } from "@/components/layout/PageSkeleton";
import { StudyViewer } from "@/components/study/StudyViewer";
import { APP } from "@/config/app";
import { pageHead, SITE_URL } from "@/lib/seo";
import { getPublicStudy } from "@/lib/study/studies.functions";
import type { StudyView } from "@/lib/study/types";

export const Route = createFileRoute("/s/$slug")({
  loader: ({ params }) => getPublicStudy({ data: { slug: params.slug } }).catch(() => null),
  head: ({ loaderData, params }) => {
    const study = loaderData as StudyView | null;
    if (!study) {
      return pageHead({
        path: "/s",
        title: `Không tìm thấy nội dung chia sẻ — ${APP.name}`,
        description: "Liên kết chia sẻ này không tồn tại, ở chế độ riêng tư hoặc đã bị thu hồi.",
        noindex: true,
      });
    }
    const players = study.white || study.black ? `${study.white ?? "?"} — ${study.black ?? "?"}. ` : "";
    return pageHead({
      path: `/s/${params.slug}`,
      title: `${study.title} | ${APP.name}`.slice(0, 110),
      description:
        (study.description ??
          `${players}Xem lại ván cờ với biến, chú giải, mũi tên và phân tích engine trên Nine64.`).slice(
          0,
          158,
        ),
      type: "article",
      image: `${SITE_URL}/api/public/study/${params.slug}/og`,
      imageType: "image/svg+xml",
      imageAlt: `Thế cờ của "${study.title}" trên Nine64`,
      // Unlisted links stay out of search results; only public studies index.
      noindex: study.visibility !== "public",
    });
  },
  pendingComponent: BoardSkeleton,
  errorComponent: () => <MissingStudy />,
  notFoundComponent: () => <MissingStudy />,
  component: SharedStudyPage,
});

function MissingStudy() {
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h1 className="font-display text-2xl font-bold">Liên kết không khả dụng</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Nội dung này ở chế độ riêng tư, đã bị thu hồi hoặc không tồn tại.
        </p>
        <Link to="/" className="mt-6 inline-block font-semibold text-brass underline">
          Về trang chủ Nine64
        </Link>
      </div>
    </AppShell>
  );
}

function SharedStudyPage() {
  const { slug } = Route.useParams();
  const study = Route.useLoaderData() as StudyView | null;
  if (!study) return <MissingStudy />;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 py-8">
        <header className="space-y-2">
          <h1 className="font-display text-3xl font-bold">{study.title}</h1>
          {study.description ? (
            <p className="max-w-3xl text-sm text-muted-foreground">{study.description}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {study.ownerName ? `Chia sẻ bởi ${study.ownerName} · ` : ""}
            {study.chapterCount} chương
          </p>
        </header>

        <StudyViewer
          study={study}
          shareUrl={`${SITE_URL}/s/${slug}`}
          embedUrl={`${SITE_URL}/api/public/study/${slug}/embed`}
        />
      </div>
    </AppShell>
  );
}
