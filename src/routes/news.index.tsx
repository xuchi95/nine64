import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ListSkeleton } from "@/components/layout/PageSkeleton";
import { APP } from "@/config/app";
import { pageHead } from "@/lib/seo";
import { useT } from "@/lib/i18n";
import { listNews } from "@/lib/watch/watch.functions";
import type { NewsCard } from "@/lib/watch/types";

export const Route = createFileRoute("/news/")({
  head: () =>
    pageHead({
      path: "/news",
      title: `Tin tức cờ vua — ${APP.name}`,
      description:
        "Tin tức cờ vua tổng hợp từ các nguồn được kiểm duyệt cùng bài viết gốc của Nine64: giải đấu, kỳ thủ và sự kiện đáng chú ý.",
    }),
  loader: () => listNews({ data: { limit: 40 } }),
  pendingComponent: ListSkeleton,
  component: NewsPage,
});

function NewsPage() {
  const { t } = useT();
  const { items, sources } = Route.useLoaderData() as { items: NewsCard[]; sources: string[] };
  const [source, setSource] = useState<string | null>(null);
  const filtered = source ? items.filter((n) => n.sourceName === source) : items;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold">{t("wc.news.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("wc.news.subtitle")}</p>
        </header>

        {sources.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={source === null ? "default" : "outline"} onClick={() => setSource(null)}>
              {t("wc.news.allSources")}
            </Button>
            {sources.map((s) => (
              <Button key={s} size="sm" variant={source === s ? "default" : "outline"} onClick={() => setSource(s)}>
                {s}
              </Button>
            ))}
          </div>
        )}

        {filtered.length === 0 && <p className="text-sm text-muted-foreground">{t("wc.news.empty")}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((n) => (
            <Card key={n.id} className="overflow-hidden">
              {n.imageUrl && (
                <img
                  src={n.imageUrl}
                  alt={n.title}
                  loading="lazy"
                  className="h-40 w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              )}
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{n.sourceName}</Badge>
                  <time dateTime={n.publishedAt}>
                    {new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(n.publishedAt))}
                  </time>
                </div>
                <h2 className="text-lg font-semibold leading-snug">
                  <Link to="/news/$slug" params={{ slug: n.slug }} className="hover:underline">
                    {n.title}
                  </Link>
                </h2>
                {n.summary && <p className="line-clamp-3 text-sm text-muted-foreground">{n.summary}</p>}
                <div className="flex items-center gap-3 pt-1 text-sm">
                  <Link to="/news/$slug" params={{ slug: n.slug }} className="font-semibold text-brass underline">
                    {t("wc.news.readMore")}
                  </Link>
                  {n.externalUrl && (
                    <a
                      href={n.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="size-3.5" /> {t("wc.news.original")}
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
