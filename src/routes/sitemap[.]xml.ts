/**
 * Dynamic sitemap for every public Nine64 surface.
 *
 * Static routes come from `STATIC_SITEMAP_ROUTES`; dynamic rows (news,
 * events, published courses/lessons, public studies) are paginated through
 * the anonymous publishable-key client so RLS decides what is public.
 */

import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { SITE_URL } from "@/lib/seo";
import { STATIC_SITEMAP_ROUTES } from "@/lib/seo/publicRoutes";

interface SitemapEntry {
  path: string;
  lastmod?: string | null;
  changefreq?: string;
  priority?: string;
}

const PAGE_SIZE = 1000;
/** Guard rail: publishing rejects oversized outputs, and huge sitemaps hurt crawling. */
const MAX_DYNAMIC_URLS = 20_000;

function urlXml(entry: SitemapEntry): string {
  return [
    "  <url>",
    `    <loc>${SITE_URL}${entry.path}</loc>`,
    entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : null,
    entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>` : null,
    entry.priority ? `    <priority>${entry.priority}</priority>` : null,
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = STATIC_SITEMAP_ROUTES.map((route) => ({ ...route }));

        try {
          const { createPublicSupabase } = await import("@/lib/watch/publicClient.server");
          const db = createPublicSupabase();

          const sources: {
            table: "news_articles" | "events" | "learn_courses" | "learn_lessons" | "studies";
            columns: string;
            filter: (query: never) => unknown;
            toEntry: (row: Record<string, unknown>) => SitemapEntry | null;
          }[] = [
            {
              table: "news_articles",
              columns: "slug, published_at, updated_at",
              filter: (q) => (q as { eq: (a: string, b: string) => unknown }).eq("status", "published"),
              toEntry: (row) =>
                row["slug"]
                  ? {
                      path: `/news/${encodeURIComponent(String(row["slug"]))}`,
                      lastmod: (row["updated_at"] ?? row["published_at"]) as string | null,
                      changefreq: "weekly",
                      priority: "0.6",
                    }
                  : null,
            },
            {
              table: "events",
              columns: "slug, updated_at",
              filter: (q) => q,
              toEntry: (row) =>
                row["slug"]
                  ? {
                      path: `/events/${encodeURIComponent(String(row["slug"]))}`,
                      lastmod: (row["updated_at"] ?? null) as string | null,
                      changefreq: "daily",
                      priority: "0.6",
                    }
                  : null,
            },
            {
              table: "learn_courses",
              columns: "slug, updated_at",
              filter: (q) => (q as { eq: (a: string, b: string) => unknown }).eq("status", "published"),
              toEntry: (row) =>
                row["slug"]
                  ? {
                      path: `/learn/course/${encodeURIComponent(String(row["slug"]))}`,
                      lastmod: (row["updated_at"] ?? null) as string | null,
                      changefreq: "monthly",
                      priority: "0.7",
                    }
                  : null,
            },
            {
              table: "learn_lessons",
              columns: "slug, updated_at",
              filter: (q) => (q as { eq: (a: string, b: string) => unknown }).eq("status", "published"),
              toEntry: (row) =>
                row["slug"]
                  ? {
                      path: `/learn/lesson/${encodeURIComponent(String(row["slug"]))}`,
                      lastmod: (row["updated_at"] ?? null) as string | null,
                      changefreq: "monthly",
                      priority: "0.6",
                    }
                  : null,
            },
            {
              table: "studies",
              columns: "slug, updated_at",
              filter: (q) =>
                (q as { eq: (a: string, b: unknown) => { eq: (a: string, b: unknown) => unknown } })
                  .eq("visibility", "public")
                  .eq("revoked", false),
              toEntry: (row) =>
                row["slug"]
                  ? {
                      path: `/s/${encodeURIComponent(String(row["slug"]))}`,
                      lastmod: (row["updated_at"] ?? null) as string | null,
                      changefreq: "monthly",
                      priority: "0.5",
                    }
                  : null,
            },
          ];

          let dynamicCount = 0;
          for (const source of sources) {
            for (let offset = 0; dynamicCount < MAX_DYNAMIC_URLS; offset += PAGE_SIZE) {
              const base = db.from(source.table).select(source.columns).order("slug");
              const query = source.filter(base as never) as typeof base;
              const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
              if (error) break;
              const rows = (data ?? []) as unknown as Record<string, unknown>[];
              for (const row of rows) {
                const entry = source.toEntry(row);
                if (entry && dynamicCount < MAX_DYNAMIC_URLS) {
                  entries.push(entry);
                  dynamicCount += 1;
                }
              }
              if (rows.length < PAGE_SIZE) break;
            }
          }
        } catch {
          // A backend hiccup must never take the sitemap down; ship static routes.
        }

        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...entries.map(urlXml),
          "</urlset>",
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
