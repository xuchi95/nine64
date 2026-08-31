import { APP } from "@/config/app";

/** Canonical production origin for Nine64. */
export const SITE_URL = "https://nine64.com";

/** 1200x630 social preview shipped in /public. */
export const OG_IMAGE = `${SITE_URL}/og-nine64-dark.png`;
const OG_IMAGE_ALT = `${APP.name} — pixel 64 chessboard logo`;

export interface PageSeo {
  /** Route path starting with "/" (e.g. "/play"). */
  path: string;
  title: string;
  description: string;
  /** og:type, defaults to "website". */
  type?: string;
  /** Absolute image URL; defaults to the Nine64 social card. */
  image?: string;
  /** MIME type of `image`; SVG cards pass "image/svg+xml". */
  imageType?: string;
  imageAlt?: string;
  locale?: string;
  noindex?: boolean;
}

/**
 * Build a complete head() payload (title, description, Open Graph, Twitter card,
 * canonical) for a leaf route. og:image/twitter:image live on leaves only.
 */
export function pageHead({
  path,
  title,
  description,
  type = "website",
  image = OG_IMAGE,
  imageType = "image/png",
  imageAlt = OG_IMAGE_ALT,
  locale = "vi_VN",
  noindex = false,
}: PageSeo) {
  const url = `${SITE_URL}${path === "/" ? "/" : path.replace(/\/$/, "")}`;

  return {
    meta: [
      { title },
      { name: "description", content: description },
      ...(noindex ? [{ name: "robots", content: "noindex, nofollow" }] : []),

      { property: "og:site_name", content: APP.name },
      { property: "og:locale", content: locale },
      { property: "og:type", content: type },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      { property: "og:image:secure_url", content: image },
      { property: "og:image:type", content: imageType },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: imageAlt },

      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
      { name: "twitter:image:alt", content: imageAlt },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
