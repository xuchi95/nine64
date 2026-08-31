/**
 * JSON-LD builders for Nine64 public pages.
 *
 * Every builder returns a plain object; route `head()` serialises it into a
 * `scripts` entry with `type: "application/ld+json"`.
 */

import { APP } from "@/config/app";
import { OG_IMAGE, SITE_URL } from "@/lib/seo";

export type JsonLd = Record<string, unknown>;

/** Wrap a JSON-LD object into the `head().scripts` shape. */
export function jsonLdScript(data: JsonLd | JsonLd[]) {
  return { type: "application/ld+json", children: JSON.stringify(data) };
}

/** Sitewide Organization node reused as `publisher`/`author`. */
export function organizationLd(): JsonLd {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: APP.name,
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: `${SITE_URL}/icons/icon-512.png` },
  };
}

/** WebSite node with the site search action (home route only). */
export function webSiteLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: APP.name,
    description: APP.description,
    inLanguage: ["vi-VN", "en"],
    publisher: organizationLd(),
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/news?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export interface ArticleLdInput {
  path: string;
  headline: string;
  description?: string | null;
  image?: string | null;
  publishedAt?: string | null;
  modifiedAt?: string | null;
  authorName?: string | null;
  section?: string | null;
}

/** Article node for news posts, lessons and other editorial pages. */
export function articleLd(input: ArticleLdInput): JsonLd {
  const url = `${SITE_URL}${input.path}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.headline.slice(0, 110),
    ...(input.description ? { description: input.description } : {}),
    image: [input.image || OG_IMAGE],
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    inLanguage: "vi-VN",
    ...(input.publishedAt ? { datePublished: input.publishedAt } : {}),
    ...(input.modifiedAt || input.publishedAt
      ? { dateModified: input.modifiedAt ?? input.publishedAt }
      : {}),
    author: input.authorName
      ? { "@type": "Person", name: input.authorName }
      : organizationLd(),
    publisher: organizationLd(),
    ...(input.section ? { articleSection: input.section } : {}),
  };
}

/** Ordered crumbs, root-first. Paths are site-relative. */
export function breadcrumbLd(crumbs: { name: string; path: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${SITE_URL}${crumb.path === "/" ? "/" : crumb.path.replace(/\/$/, "")}`,
    })),
  };
}

/** Course node for Academy course pages. */
export function courseLd(input: { path: string; name: string; description: string }): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: input.name,
    description: input.description,
    url: `${SITE_URL}${input.path}`,
    inLanguage: "vi-VN",
    provider: organizationLd(),
  };
}
