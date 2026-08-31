import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { articleLd, breadcrumbLd, jsonLdScript } from "@/lib/seo/structuredData";
import { useT } from "@/lib/i18n";
import { getNewsArticle } from "@/lib/watch/watch.functions";
import type { NewsArticleDetail } from "@/lib/watch/types";

export const Route = createFileRoute("/news/$slug")({
  loader: ({ params }) => getNewsArticle({ data: { slug: params.slug } }),
  head: ({ loaderData }) => {
    if (!loaderData) {
      return pageHead({
        path: "/news",
        title: `Không tìm thấy bài viết — ${APP.name}`,
        description: "Bài viết này không tồn tại hoặc đã bị gỡ.",
        noindex: true,
      });
    }
    const a = loaderData;
    const head = pageHead({
      path: `/news/${a.slug}`,
      title: `${a.title} | ${APP.name}`.slice(0, 110),
      description: (a.summary ?? `Tin cờ vua từ ${a.sourceName} trên ${APP.name}.`).slice(0, 158),
      type: "article",
      ...(a.imageUrl?.startsWith("https://") ? { image: a.imageUrl } : {}),
    });
    return {
      ...head,
      scripts: [
        jsonLdScript([
          articleLd({
            path: `/news/${a.slug}`,
            headline: a.title,
            description: a.summary,
            image: a.imageUrl,
            publishedAt: a.publishedAt,
            section: "Chess news",
          }),
          breadcrumbLd([
            { name: "Trang chủ", path: "/" },
            { name: "Tin tức", path: "/news" },
            { name: a.title, path: `/news/${a.slug}` },
          ]),
        ]),
      ],
    };

  },
  pendingComponent: ListSkeleton,
  errorComponent: () => <MissingArticle />,
  notFoundComponent: () => <MissingArticle />,
  component: ArticlePage,
});

function MissingArticle() {
  const { t } = useT();
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl py-16 text-center">
        <p className="text-muted-foreground">{t("wc.news.notFound")}</p>
        <Link to="/news" className="mt-3 inline-block font-semibold text-brass underline">
          {t("wc.news.title")}
        </Link>
      </div>
    </AppShell>
  );
}

function ArticlePage() {
  const { t } = useT();
  const article = Route.useLoaderData() as NewsArticleDetail | null;
  if (!article) return <MissingArticle />;

  return (
    <AppShell>
      <article className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{article.sourceName}</Badge>
          <time dateTime={article.publishedAt}>
            {new Intl.DateTimeFormat("vi-VN", { dateStyle: "long" }).format(new Date(article.publishedAt))}
          </time>
        </div>
        <h1 className="text-3xl font-bold leading-tight">{article.title}</h1>
        {article.summary && <p className="text-lg text-muted-foreground">{article.summary}</p>}
        {article.imageUrl && (
          <img
            src={article.imageUrl}
            alt={article.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full rounded-xl object-cover"
          />
        )}
        {/* contentHtml is sanitized server-side by sanitizeHtml() before storage. */}
        {article.contentHtml && (
          <div
            className="prose prose-invert max-w-none prose-a:text-brass"
            dangerouslySetInnerHTML={{ __html: article.contentHtml }}
          />
        )}
        {article.externalUrl && (
          <a
            href={article.externalUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 font-semibold text-brass underline"
          >
            <ExternalLink className="size-4" /> {t("wc.news.original")}
          </a>
        )}
      </article>
    </AppShell>
  );
}
