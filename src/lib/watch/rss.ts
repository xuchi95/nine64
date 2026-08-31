/**
 * Dependency-free RSS 2.0 / Atom parser.
 *
 * Runs in the Worker runtime (no DOMParser, no Node-only XML libraries), and
 * returns raw strings only — sanitization and allowlisting happen in the
 * ingestion layer, never here.
 */

import { htmlToText } from "./sanitizeHtml";

export interface FeedItem {
  guid: string;
  title: string;
  link: string | null;
  publishedAt: string | null;
  summaryHtml: string | null;
  imageUrl: string | null;
  author: string | null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .trim();
}

function tagContent(block: string, ...names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i");
    const m = re.exec(block);
    if (m?.[1] !== undefined) {
      const value = decodeEntities(m[1]);
      if (value) return value;
    }
  }
  return null;
}

function attrOf(block: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}\\b([^>]*)>`, "i");
  const m = re.exec(block);
  if (!m?.[1]) return null;
  const a = new RegExp(`${attr}\\s*=\\s*"([^"]*)"|${attr}\\s*=\\s*'([^']*)'`, "i").exec(m[1]);
  return a ? decodeEntities(a[1] ?? a[2] ?? "") : null;
}

function atomLink(block: string): string | null {
  const re = /<link\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  let fallback: string | null = null;
  while ((m = re.exec(block))) {
    const attrs = m[1] ?? "";
    const href = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i.exec(attrs);
    if (!href) continue;
    const url = decodeEntities(href[1] ?? href[2] ?? "");
    if (/rel\s*=\s*["']?alternate/i.test(attrs)) return url;
    fallback ??= url;
  }
  return fallback;
}

function toIso(value: string | null): string | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function findImage(block: string): string | null {
  const enclosure = attrOf(block, "enclosure", "url");
  if (enclosure && /^https?:/i.test(enclosure)) return enclosure;
  for (const tag of ["media:content", "media:thumbnail", "itunes:image"]) {
    const url = attrOf(block, tag, tag === "itunes:image" ? "href" : "url");
    if (url && /^https?:/i.test(url)) return url;
  }
  const body = tagContent(block, "content:encoded", "content", "description", "summary") ?? "";
  const img = /<img\b[^>]*src\s*=\s*["']([^"']+)["']/i.exec(body);
  return img?.[1] && /^https?:/i.test(img[1]) ? img[1] : null;
}

/** Parse an RSS or Atom document into normalized items. */
export function parseFeed(xml: string, limit = 40): FeedItem[] {
  const blocks = [
    ...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi),
  ].map((m) => m[0]);

  const items: FeedItem[] = [];
  for (const block of blocks.slice(0, limit)) {
    const title = tagContent(block, "title");
    if (!title) continue;
    const link = tagContent(block, "link") ?? atomLink(block);
    const summaryHtml = tagContent(block, "description", "summary", "content:encoded", "content");
    const guid = tagContent(block, "guid", "id") ?? link ?? title;
    items.push({
      guid,
      title: htmlToText(title, 300) || title,
      link: link && /^https?:/i.test(link) ? link : null,
      publishedAt: toIso(tagContent(block, "pubDate", "published", "updated", "dc:date")),
      summaryHtml,
      imageUrl: findImage(block),
      author: tagContent(block, "dc:creator", "author", "name"),
    });
  }
  return items;
}
