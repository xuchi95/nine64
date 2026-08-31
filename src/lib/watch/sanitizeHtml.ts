/**
 * Minimal allowlist HTML sanitizer for imported third-party content.
 *
 * Imported feeds are hostile input: everything that is not explicitly allowed
 * is dropped. Scripts, styles, iframes, embeds, event handlers, `javascript:`
 * URLs and unknown attributes never survive, so no third-party script can be
 * rendered by the news surfaces.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "a",
  "img",
  "figure",
  "figcaption",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);

/** Tags whose entire subtree is removed, not just the tag itself. */
const DROP_SUBTREE = ["script", "style", "iframe", "object", "embed", "noscript", "svg", "template", "form"];

const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ["href", "title"],
  img: ["src", "alt", "title"],
};

const VOID_TAGS = new Set(["br", "img", "hr"]);

function isSafeUrl(value: string): boolean {
  const v = value.trim().replace(/[\u0000-\u001f]/g, "");
  if (/^(https?:|mailto:)/i.test(v)) return true;
  // Allow relative links, but never protocol-relative or scheme URLs.
  return !/^[a-z][a-z0-9+.-]*:/i.test(v) && !v.startsWith("//");
}

function escapeText(input: string): string {
  return input.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitizeAttributes(tag: string, raw: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return "";
  const out: string[] = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const name = (m[1] ?? "").toLowerCase();
    if (!allowed.includes(name)) continue;
    const value = m[3] ?? m[4] ?? m[5] ?? "";
    if ((name === "href" || name === "src") && !isSafeUrl(value)) continue;
    out.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
  }
  if (tag === "a") {
    out.push('target="_blank"', 'rel="nofollow noopener noreferrer ugc"');
  }
  if (tag === "img") {
    out.push('loading="lazy"', 'referrerpolicy="no-referrer"');
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

/** Sanitize an untrusted HTML fragment down to a safe allowlist. */
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";
  let html = String(input);

  // Comments and CDATA.
  html = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  // Whole dangerous subtrees (including unclosed ones).
  for (const tag of DROP_SUBTREE) {
    html = html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    html = html.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
  }

  const open: string[] = [];
  let out = "";
  let index = 0;
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html))) {
    out += escapeText(html.slice(index, match.index));
    index = match.index + match[0].length;

    const tag = (match[1] ?? "").toLowerCase();
    const closing = match[0].startsWith("</");
    if (!ALLOWED_TAGS.has(tag)) continue;

    if (closing) {
      const at = open.lastIndexOf(tag);
      if (at === -1) continue;
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }

    if (VOID_TAGS.has(tag)) {
      out += `<${tag}${sanitizeAttributes(tag, match[2] ?? "")} />`;
      continue;
    }
    out += `<${tag}${sanitizeAttributes(tag, match[2] ?? "")}>`;
    open.push(tag);
  }

  out += escapeText(html.slice(index));
  while (open.length) out += `</${open.pop()}>`;
  return out.trim();
}

/** Strip every tag and collapse whitespace — used for summaries. */
export function htmlToText(input: string | null | undefined, maxLength = 320): string {
  if (!input) return "";
  const text = String(input)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).replace(/\s+\S*$/, "")}…`;
}

/** Host of a URL, lowercased and without `www.`; null when unparseable. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Allowlist check: the URL host must match (or be a subdomain of) an entry. */
export function isHostAllowed(url: string | null | undefined, allowedHosts: string[]): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return allowedHosts.some((raw) => {
    const allowed = raw.trim().toLowerCase().replace(/^www\./, "");
    if (!allowed) return false;
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}
